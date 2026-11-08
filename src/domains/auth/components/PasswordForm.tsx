"use client";
import { useActionState } from "react";
import { setPasswordAction, type AuthState } from "@/domains/auth/actions";

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(setPasswordAction, {});
  return (
    <form action={action} className="card flex flex-col gap-3">
      <div className="font-semibold">비밀번호 설정</div>
      <p className="text-sm text-muted">{email} 계정의 비밀번호를 정하면 이메일 링크 없이도 로그인할 수 있습니다.</p>
      <input name="password" type="password" required minLength={6} className="input" placeholder="새 비밀번호 (6자 이상)" autoComplete="new-password" />
      <input name="confirm" type="password" required minLength={6} className="input" placeholder="한 번 더" autoComplete="new-password" />
      {state.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state.message && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
