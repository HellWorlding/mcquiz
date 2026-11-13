import "server-only";
import { createClient } from "@/domains/auth/supabase/server";
import type { CurrentUser } from "@/domains/auth/session";

export const AI_WINDOW_HOURS = 12;
export const AI_LIMIT_USER = 10;
export const AI_LIMIT_ADMIN = 100;

export type AiQuota = { limit: number; used: number; remaining: number; windowHours: number; resetAt: string | null };

/** 지난 12시간 동안 쓴 횟수와 남은 횟수. resetAt = 가장 오래된 기록이 창을 벗어나는 시각 */
export async function getAiQuota(user: CurrentUser): Promise<AiQuota> {
  const db = await createClient();
  const since = new Date(Date.now() - AI_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data } = await db
    .from("ai_questions")
    .select("created_at")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  // 계정별 한도(profiles.ai_limit)가 있으면 그것을, 없으면 역할 기본값
  const limit = user.profile.ai_limit ?? (user.isAdmin ? AI_LIMIT_ADMIN : AI_LIMIT_USER);
  const used = data?.length ?? 0;
  const oldest = data?.[0]?.created_at ?? null;
  const resetAt = oldest ? new Date(new Date(oldest).getTime() + AI_WINDOW_HOURS * 3600 * 1000).toISOString() : null;
  return { limit, used, remaining: Math.max(0, limit - used), windowHours: AI_WINDOW_HOURS, resetAt };
}
