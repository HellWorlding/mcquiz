import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { env } from "@/domains/shared/env";
import type { Profile } from "@/domains/shared/types";

export type CurrentUser = {
  id: string;
  email: string;
  profile: Profile;
  isAdmin: boolean;
};

/** 현재 로그인 사용자. 요청당 한 번만 조회한다. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  // ADMIN_EMAIL 계정은 첫 로그인 때 자동으로 관리자 플래그를 켠다 (service role 필요)
  const email = (user.email ?? "").toLowerCase();
  if (env.adminEmail && email === env.adminEmail && env.serviceRoleKey && !profile?.is_admin) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .upsert({ id: user.id, email: user.email ?? null, is_admin: true }, { onConflict: "id" })
      .select("*")
      .single();
    if (data) profile = data;
  }
  if (!profile) {
    profile = {
      id: user.id,
      email: user.email ?? null,
      display_name: null,
      is_admin: false,
      created_at: new Date().toISOString(),
    };
  }
  return { id: user.id, email: user.email ?? "", profile, isAdmin: profile.is_admin };
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
