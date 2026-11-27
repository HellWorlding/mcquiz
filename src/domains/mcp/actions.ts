"use server";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import type { ActionResult } from "@/domains/shared/types";

/** OAuth 동의 화면의 허용/거부. 돌려주는 값은 클라이언트(Claude 등)로 돌아갈 주소 */
export async function decideOAuthAction(authorizationId: string, approve: boolean): Promise<ActionResult<string>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const db = await createClient();
  const { data, error } = approve
    ? await db.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await db.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) return { ok: false, error: error?.message ?? "처리하지 못했습니다." };
  return { ok: true, data: data.redirect_url };
}
