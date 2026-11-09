"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, magicLinkAction, signupAction, type AuthState } from "@/domains/auth/actions";
import { useT } from "@/domains/shared/i18n-client";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "login" ? loginAction : signupAction,
    {},
  );
  const [linkState, linkAction, linkPending] = useActionState<AuthState, FormData>(magicLinkAction, {});
  const t = useT();
  return (
    <div className="mx-auto mt-8 max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">{mode === "login" ? t("auth.login") : t("auth.signup")}</h1>
      <form action={action} className="card flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="display_name">
              {t("auth.name")}
            </label>
            <input id="display_name" name="display_name" className="input" autoComplete="nickname" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">
            {t("auth.email")}
          </label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" inputMode="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            {t("auth.password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="input"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
        {state.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
        {state.message && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>}
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? t("auth.processing") : mode === "login" ? t("auth.login") : t("auth.signup_btn")}
        </button>
      </form>
      {mode === "login" && (
        <form action={linkAction} className="card mt-4 flex flex-col gap-3">
          {next && <input type="hidden" name="next" value={next} />}
          <div className="font-semibold">{t("auth.magic_title")}</div>
          <p className="text-sm text-muted">{t("auth.magic_desc")}</p>
          <input name="email" type="email" required className="input" placeholder={t("auth.email")} autoComplete="email" inputMode="email" />
          {linkState.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{linkState.error}</p>}
          {linkState.message && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{linkState.message}</p>}
          <button className="btn-secondary" type="submit" disabled={linkPending}>
            {linkPending ? t("auth.sending") : t("auth.magic_btn")}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            {t("auth.no_account")}{" "}
            <Link href="/signup" className="text-accent underline">
              {t("auth.signup")}
            </Link>
          </>
        ) : (
          <>
            {t("auth.have_account")}{" "}
            <Link href="/login" className="text-accent underline">
              {t("auth.login")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
