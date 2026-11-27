/** K5. AI 질문 한도: 12시간 창, 관리자 100 / 일반 10 / 개인 ai_limit (순수 계산) */
export const AI_WINDOW_HOURS = 12;
export const AI_LIMIT_USER = 10;
export const AI_LIMIT_ADMIN = 100;

export type AiQuota = { limit: number; used: number; remaining: number; windowHours: number; resetAt: string | null };

/** 계정별 한도(profiles.ai_limit)가 있으면 그것을, 없으면 역할 기본값 */
export function quotaLimit(user: { isAdmin: boolean; aiLimit: number | null }): number {
  return user.aiLimit ?? (user.isAdmin ? AI_LIMIT_ADMIN : AI_LIMIT_USER);
}

/** 창의 시작 시각 (이 이후의 기록만 센다) */
export function quotaWindowStart(now: Date, windowHours = AI_WINDOW_HOURS): Date {
  return new Date(now.getTime() - windowHours * 3600 * 1000);
}

/**
 * 지난 창 동안 쓴 횟수와 남은 횟수. timestamps 는 기록 시각(ISO) — 창 밖의 것은 여기서 걸러낸다.
 * resetAt = 창 안의 가장 오래된 기록이 창을 벗어나는 시각 (기록이 없으면 null)
 */
export function computeQuota(now: Date, timestamps: string[], limit: number, windowHours = AI_WINDOW_HOURS): AiQuota {
  const since = quotaWindowStart(now, windowHours).getTime();
  const inWindow = timestamps.map((t) => new Date(t).getTime()).filter((t) => t >= since && t <= now.getTime()).sort((a, b) => a - b);
  const used = inWindow.length;
  const resetAt = inWindow.length ? new Date(inWindow[0] + windowHours * 3600 * 1000).toISOString() : null;
  return { limit, used, remaining: Math.max(0, limit - used), windowHours, resetAt };
}

/** 질문 1건을 쓴 뒤의 한도 (응답에 바로 반영) */
export function consumeQuota(q: AiQuota): AiQuota {
  return { ...q, used: q.used + 1, remaining: Math.max(0, q.remaining - 1) };
}

/** 한도 초과 안내 문구 (옛 chatAction 과 같은 문장) */
export function quotaExceededMessage(q: AiQuota): string {
  const reset = q.resetAt ? new Date(q.resetAt).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }) : "";
  return `AI 질문 한도(${q.windowHours}시간에 ${q.limit}회)를 다 썼습니다. ${reset ? `${reset} 이후에 다시 할 수 있습니다.` : ""}`;
}
