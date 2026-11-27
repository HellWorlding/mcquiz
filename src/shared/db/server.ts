// server-only 를 붙이지 않는다: 스크립트(tsx)도 이 조립을 쓴다. 클라이언트 컴포넌트 유입은 eslint boundaries 가 막는다.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { env } from "@/shared/env";

/** 로그인한 사용자의 쿠키 세션으로 동작하는 클라이언트 (RLS 적용). 리포지토리 안에서 `.schema("<ctx>")` 로 쓴다 */
export async function sessionDb() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서 호출되면 쿠키를 쓸 수 없다. proxy 가 세션을 갱신하므로 무시한다.
        }
      },
    },
  });
}
export type SessionDb = Awaited<ReturnType<typeof sessionDb>>;
