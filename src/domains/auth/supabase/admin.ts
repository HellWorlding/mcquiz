import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import { env } from "@/domains/shared/env";

/** service role 클라이언트. RLS 를 우회하므로 서버 전용이며 꼭 필요한 곳에서만 쓴다. */
export function createAdminClient() {
  if (!env.serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다");
  return createSupabaseClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
