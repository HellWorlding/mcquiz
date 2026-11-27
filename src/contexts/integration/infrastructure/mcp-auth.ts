import "server-only";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { CurrentUser } from "@/contexts/access";
import { tokenDb } from "@/shared/db/admin";
import type { Db } from "@/shared/db/types";
import { err, ok, type Result } from "@/shared/result";

/**
 * MCP 요청의 Bearer 토큰(Supabase Auth OAuth 2.1 서버가 발급한 사용자 액세스 토큰) 검증.
 * 토큰 서명을 JWKS 로 확인하고(비대칭 키) 사용자 id·이메일을 AuthInfo.extra 에 담는다. 잘못된 토큰이면 undefined.
 * 검증이 네트워크(JWKS) 때문에 매달리면 10초 뒤 401 로 끝낸다.
 */
export async function verifyMcpToken(_req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  const t0 = Date.now();
  try {
    const db = tokenDb(token);
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("getClaims timeout")), 10_000));
    const { data, error } = await Promise.race([db.auth.getClaims(token), timeout]);
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

/**
 * 도구 핸들러의 인증 정보 → 그 사용자의 토큰 클라이언트(RLS 적용)와 CurrentUser.
 * isAdmin 은 access.is_admin() 으로 한 번 확인한다. 인증이 없으면 err (withMcpAuth required 라 실제로는 오지 않는다).
 */
export async function userFromAuth(authInfo: AuthInfo | undefined): Promise<Result<{ db: Db; user: CurrentUser }>> {
  const userId = authInfo?.extra && typeof authInfo.extra.userId === "string" ? authInfo.extra.userId : null;
  if (!authInfo?.token || !userId) return err("로그인이 필요합니다.");
  const db = tokenDb(authInfo.token);
  const { data: isAdmin, error } = await db.schema("access").rpc("is_admin");
  if (error) return err(error.message);
  const email = typeof authInfo.extra?.email === "string" ? authInfo.extra.email : "";
  return ok({ db, user: { id: userId, email, displayName: null, isAdmin: isAdmin === true, aiLimit: null } });
}
