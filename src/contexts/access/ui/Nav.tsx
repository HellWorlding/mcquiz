import Link from "next/link";
import { getCurrentUser } from "../infrastructure/session";
import { signoutAction } from "./actions";
import { getLang } from "@/shared/i18n/server";
import { t } from "@/shared/i18n/messages";
import { setLangAction } from "@/shared/i18n/actions";

export async function Nav() {
  const [user, lang] = await Promise.all([getCurrentUser(), getLang()]);
  const tr = (k: Parameters<typeof t>[1]) => t(lang, k);
  const other = lang === "ko" ? "en" : "ko";
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          MCQuiz
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {user ? (
            <>
              <Link href="/" className="btn-ghost btn-sm">
                {tr("nav.subjects")}
              </Link>
              <Link href="/weak" className="btn-ghost btn-sm">
                {tr("nav.saved")}
              </Link>
              <Link href="/notes" className="btn-ghost btn-sm">
                {tr("nav.notes")}
              </Link>
              <Link href="/board" className="btn-ghost btn-sm">
                {tr("nav.board")}
              </Link>
              {user.isAdmin && (
                <Link href="/admin" className="btn-ghost btn-sm">
                  {tr("nav.admin")}
                </Link>
              )}
              <Link href="/account" className="btn-ghost btn-sm">
                {tr("nav.account")}
              </Link>
              <form action={signoutAction}>
                <button className="btn-secondary btn-sm" type="submit">
                  {tr("nav.logout")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost btn-sm">
                {tr("nav.login")}
              </Link>
              <Link href="/signup" className="btn-primary btn-sm">
                {tr("nav.signup")}
              </Link>
            </>
          )}
          <form action={setLangAction.bind(null, other)}>
            <button className="btn-ghost btn-sm inline-flex items-center gap-1 font-bold" type="submit" aria-label="language" title={other === "en" ? "Switch to English" : "한국어로 보기"}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
              {tr("lang.toggle")}
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
