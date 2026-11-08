"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "@/domains/auth/actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "login" ? loginAction : signupAction,
    {},
  );
  return (
    <div className="mx-auto mt-8 max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">{mode === "login" ? "로그인" : "회원가입"}</h1>
      <form action={action} className="card flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="display_name">
              이름 (선택)
            </label>
            <input id="display_name" name="display_name" className="input" autoComplete="nickname" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">
            이메일
          </label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" inputMode="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            비밀번호
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
          {pending ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            계정이 없나요?{" "}
            <Link href="/signup" className="text-accent underline">
              회원가입
            </Link>
          </>
        ) : (
          <>
            이미 계정이 있나요?{" "}
            <Link href="/login" className="text-accent underline">
              로그인
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
