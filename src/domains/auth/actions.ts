"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";

export type AuthState = { error?: string; message?: string };

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력하세요." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  redirect(safeNext(formData.get("next")));
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!email || !password) return { error: "이메일과 비밀번호를 입력하세요." };
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 합니다." };
  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || email.split("@")[0] },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/");
  return { message: "가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료하세요." };
}

export async function signoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
