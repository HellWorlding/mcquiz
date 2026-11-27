import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/db/database.types";

export function serviceDb() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** 테스트 사용자(이메일+비밀번호)를 만들거나 재사용하고, 그 사용자의 세션 클라이언트를 돌려준다 */
export async function userDb(email: string, password = "test-password-123", opts: { admin?: boolean } = {}) {
  const admin = serviceDb();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users.find((u) => u.email === email) ?? null;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password });
  }
  await admin.schema("access").from("profiles").upsert({ id: user.id, email, is_admin: !!opts.admin }, { onConflict: "id" });
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { db: client, id: user.id };
}

/** 고유 이름의 과목을 만든다. 돌려주는 cleanup 으로 지운다 (cascade) */
export async function tempSubject(visibility: "public" | "restricted" = "restricted") {
  const admin = serviceDb();
  const name = `__test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await admin.schema("catalog").from("subjects").insert({ name, visibility }).select("id").single();
  if (error) throw error;
  return { id: data.id, name, cleanup: async () => void (await admin.schema("catalog").from("subjects").delete().eq("id", data.id)) };
}
