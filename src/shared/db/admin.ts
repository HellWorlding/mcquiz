import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { env } from "@/shared/env";

/** service role 클라이언트. RLS 를 우회하므로 서버·스크립트 전용이며 꼭 필요한 곳에서만 쓴다 (server-only 를 붙이지 않는 이유: 스크립트도 쓴다) */
export function adminDb() {
  if (!env.serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다");
  return createSupabaseClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 사용자 액세스 토큰(MCP Bearer)으로 동작하는 클라이언트. 그 사용자의 RLS 가 적용된다 */
export function tokenDb(token: string) {
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
