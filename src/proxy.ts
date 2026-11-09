import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/subjects", "/quiz", "/weak", "/admin", "/collections", "/account", "/chat", "/notes"];

const CANONICAL_HOST = process.env.NEXT_PUBLIC_CANONICAL_HOST || "mcquiz.site";

export async function proxy(request: NextRequest) {
  // 예전 주소(*.vercel.app)나 www 로 들어오면 대표 도메인의 같은 경로로 보낸다
  const host = request.headers.get("host") ?? "";
  if (host && host !== CANONICAL_HOST && (host.endsWith(".vercel.app") || host === `www.${CANONICAL_HOST}`)) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // 세션 토큰 갱신 (반드시 getUser 호출)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const guestAccess = (process.env.PUBLIC_GUEST_ACCESS ?? "false").toLowerCase() === "true";
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const guestAllowed = guestAccess && !["/admin", "/weak", "/account", "/chat", "/notes"].some((p) => pathname.startsWith(p));

  if (!user && isProtected && !guestAllowed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
