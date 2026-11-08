import Link from "next/link";
import { getCurrentUser } from "@/domains/auth/session";
import { signoutAction } from "@/domains/auth/actions";

export async function Nav() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          mcquiz
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {user ? (
            <>
              <Link href="/" className="btn-ghost btn-sm">
                주제
              </Link>
              <Link href="/weak" className="btn-ghost btn-sm">
                약점
              </Link>
              {user.isAdmin && (
                <Link href="/admin" className="btn-ghost btn-sm">
                  관리
                </Link>
              )}
              <Link href="/account" className="btn-ghost btn-sm">
                계정
              </Link>
              <form action={signoutAction}>
                <button className="btn-secondary btn-sm" type="submit">
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost btn-sm">
                로그인
              </Link>
              <Link href="/signup" className="btn-primary btn-sm">
                가입
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
