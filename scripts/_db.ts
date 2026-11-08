/* 로컬 스크립트 공용: .env.local 을 읽고 service role 클라이언트를 만든다 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/domains/shared/database.types";

config({ path: ".env.local" });
config();

export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 필요합니다.");
    process.exit(1);
  }
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function findSubject(db: ReturnType<typeof adminDb>, name: string) {
  const { data } = await db.from("subjects").select("*").eq("name", name).maybeSingle();
  if (!data) {
    console.error(`주제 "${name}" 이 없습니다. 먼저 만드세요: npm run admin:grant -- --create-subject "${name}" [public|restricted]`);
    process.exit(1);
  }
  return data;
}
