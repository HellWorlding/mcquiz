"use client";
import { useActionState } from "react";
import { setPasswordAction, type AuthState } from "@/domains/auth/actions";
import { useT } from "@/domains/shared/i18n-client";

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(setPasswordAction, {});
  const t = useT();
  return (
    <form action={action} className="card flex flex-col gap-3">
      <div className="font-semibold">{t("account.set_password")}</div>
      <p className="text-sm text-muted">{t("account.set_password_desc", { email })}</p>
      <input name="password" type="password" required minLength={6} className="input" placeholder={t("account.new_password")} autoComplete="new-password" />
      <input name="confirm" type="password" required minLength={6} className="input" placeholder={t("account.confirm_password")} autoComplete="new-password" />
      {state.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state.message && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? t("account.saving") : t("common.save")}
      </button>
    </form>
  );
}
