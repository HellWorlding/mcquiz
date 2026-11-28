"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sessionDb } from "@/shared/db/server";
import { adminDb } from "@/shared/db/admin";
import { env } from "@/shared/env";
import type { Result } from "@/shared/result";
import { getCurrentUser } from "../infrastructure/session";
import { makeAccessDeps } from "../infrastructure/make-deps";
import { grantMember, listMembers, revokeMember } from "../application/members";
import type { Member } from "../application/ports";

export type AuthState = { error?: string; message?: string };

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력하세요." };
  const db = await sessionDb();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  redirect(safeNext(formData.get("next")));
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!email || !password) return { error: "이메일과 비밀번호를 입력하세요." };
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 합니다." };
  const db = await sessionDb();
  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split("@")[0] }, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/");
  return { message: "가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료하세요." };
}

/** 비밀번호 없이 이메일로 로그인 링크 보내기 (매직 링크) */
export async function magicLinkAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "이메일을 입력하세요." };
  const db = await sessionDb();
  const origin = (await headers()).get("origin") ?? "";
  const next = safeNext(formData.get("next"));
  const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
  if (error) return { error: error.message };
  return { message: "로그인 링크를 메일로 보냈습니다. 메일의 링크를 누르면 바로 로그인됩니다." };
}

/** 비밀번호 재설정 메일. 링크 → /auth/callback → /account?reset=1 (새 비밀번호 폼) */
export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "이메일을 입력하세요." };
  const db = await sessionDb();
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/account?reset=1")}` });
  if (error) return { error: error.message };
  return { message: "재설정 링크를 메일로 보냈습니다. 메일의 링크를 누르면 새 비밀번호를 정할 수 있습니다." };
}

/** 로그인한 상태에서 비밀번호 새로 정하기 */
export async function setPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 합니다." };
  if (password !== confirm) return { error: "두 비밀번호가 다릅니다." };
  const db = await sessionDb();
  const { error } = await db.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { message: "비밀번호를 저장했습니다. 다음부터는 이메일과 비밀번호로 로그인할 수 있습니다." };
}

export async function signoutAction() {
  const db = await sessionDb();
  await db.auth.signOut();
  redirect("/login");
}

/** admin 클라이언트는 "이메일로 다른 사람 찾기"(멤버 부여) 에만 붙인다 */
async function deps(withAdmin = false) {
  const [db, user] = await Promise.all([sessionDb(), getCurrentUser()]);
  return makeAccessDeps(db, user, withAdmin && env.serviceRoleKey ? adminDb() : null);
}

export async function listMembersAction(subjectId: string): Promise<Result<Member[]>> {
  return listMembers(await deps(), subjectId);
}
export async function grantMemberAction(subjectId: string, email: string): Promise<Result<{ userId: string }>> {
  const r = await grantMember(await deps(true), subjectId, email);
  if (r.ok) revalidatePath("/admin");
  return r;
}
export async function revokeMemberAction(subjectId: string, userId: string): Promise<Result<void>> {
  const r = await revokeMember(await deps(), subjectId, userId);
  if (r.ok) revalidatePath("/admin");
  return r;
}
