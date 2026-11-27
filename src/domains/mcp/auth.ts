import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Database } from "@/domains/shared/database.types";
import { env } from "@/domains/shared/env";

/**
 * MCP 요청의 Bearer 토큰(Supabase Auth OAuth 2.1 서버가 발급한 사용자 액세스 토큰)을 그대로 들고
 * Supabase 를 부르는 클라이언트. 모든 조회·쓰기에 그 사용자의 RLS 가 적용된다.
 */
export function clientForToken(token: string) {
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type McpClient = ReturnType<typeof clientForToken>;

/** 토큰 서명을 JWKS 로 검증하고(비대칭 키), 사용자 id 를 AuthInfo.extra 에 담는다. 잘못된 토큰이면 undefined */
export async function verifyMcpToken(_req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  const t0 = Date.now();
  try {
    const sb = clientForToken(token);
    // 검증이 네트워크(JWKS) 때문에 매달리면 10초 뒤 401 로 끝낸다
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("getClaims timeout")), 10_000));
    const { data, error } = await Promise.race([sb.auth.getClaims(token), timeout]);
    const c = data?.claims;
    if (error || !c?.sub) {
      console.log(`[mcp] auth rejected ${Date.now() - t0}ms ${error?.message ?? "no sub"}`);
      return undefined;
    }
    if (Date.now() - t0 > 1000) console.log(`[mcp] auth slow ${Date.now() - t0}ms`);
    const scopes = typeof c.scope === "string" ? c.scope.split(" ").filter(Boolean) : [];
    return {
      token,
      clientId: typeof c.client_id === "string" ? c.client_id : "unknown",
      scopes,
      expiresAt: typeof c.exp === "number" ? c.exp : undefined,
      extra: { userId: c.sub, email: typeof c.email === "string" ? c.email : null },
    };
  } catch (e) {
    console.log(`[mcp] auth error ${Date.now() - t0}ms ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/** 도구 핸들러에서 인증 정보 → 사용자 클라이언트. 인증이 없으면 예외 (withMcpAuth required 라 실제로는 오지 않는다) */
export function clientFromAuth(authInfo: AuthInfo | undefined): { db: McpClient; userId: string } {
  const userId = authInfo?.extra && typeof authInfo.extra.userId === "string" ? authInfo.extra.userId : null;
  if (!authInfo?.token || !userId) throw new Error("로그인이 필요합니다.");
  return { db: clientForToken(authInfo.token), userId };
}
