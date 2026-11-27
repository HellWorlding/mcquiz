/** 게스트(비로그인) 체험 규칙 (순수). D-009: 공개 과목을 N문항까지 풀어 보고 로그인 유도 */
export const GUEST_TRIAL_LIMIT = 5;
export const GUEST_TRIAL_COOKIE = "mcquiz_guest_trial";

/** 게스트면 앞에서 N개만 (총 문항 수는 그대로 보여 준다) */
export function capForGuest<T>(ids: T[], isGuest: boolean, limit = GUEST_TRIAL_LIMIT): T[] {
  return isGuest ? ids.slice(0, limit) : ids;
}

/** 쿠키 값 = 체험한 날짜(YYYY-MM-DD, 로컬). 같은 날이면 다시 체험 불가 */
export function trialDateKey(now: Date): string {
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0"), d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export function isTrialUsed(cookieValue: string | undefined, now: Date): boolean {
  return !!cookieValue && cookieValue === trialDateKey(now);
}
