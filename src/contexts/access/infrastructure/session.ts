// server-only 를 붙이지 않는다: 스크립트(tsx)도 이 조립을 쓴다. 클라이언트 컴포넌트 유입은 eslint boundaries 가 막는다.
import { cache } from "react";
import { redirect } from "next/navigation";
import { sessionDb } from "@/shared/db/server";
import { adminDb } from "@/shared/db/admin";
import { env } from "@/shared/env";
import type { CurrentUser } from "../domain/user";

/** 현재 로그인 사용자. 요청당 한 번만 조회한다. ADMIN_EMAIL 계정은 첫 로그인 때 관리자 플래그를 켠다 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const db = await sessionDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  let { data: profile } = await db.schema("access").from("profiles").select("*").eq("id", user.id).maybeSingle();
  const email = (user.email ?? "").toLowerCase();
  if (env.adminEmail && email === env.adminEmail && env.serviceRoleKey && !profile?.is_admin) {
    const { data } = await adminDb()
      .schema("access")
      .from("profiles")
      .upsert({ id: user.id, email: user.email ?? null, is_admin: true }, { onConflict: "id" })
      .select("*")
      .single();
    if (data) profile = data;
  }
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name ?? null,
    isAdmin: profile?.is_admin ?? false,
    aiLimit: profile?.ai_limit ?? null,
  };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (!user.isAdmin) redirect("/?error=forbidden");
  return user;
}
