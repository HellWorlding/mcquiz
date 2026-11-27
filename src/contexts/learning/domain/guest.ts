/** 게스트(비로그인) 체험 규칙 (순수). D-009: 공개 과목을 N문항까지 풀어 보고 로그인 유도 */
export const GUEST_TRIAL_LIMIT = 5;
export const GUEST_TRIAL_COOKIE = "mcquiz_guest_trial";

/** 게스트면 앞에서 N개만 (총 문항 수는 그대로 보여 준다) */
export function capForGuest<T>(ids: T[], isGuest: boolean, limit = GUEST_TRIAL_LIMIT): T[] {
  return isGuest ? ids.slice(0, limit) : ids;
}

/** 날짜 키 (YYYY-MM-DD, KST 고정 — Vercel 서버 시각이 UTC 라도 한국 하루 기준) */
export function trialDateKey(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 쿠키 값 = "날짜:퀴즈키". 퀴즈키는 시작한 퀴즈(주소)의 해시 — 같은 퀴즈는 이어서 풀 수 있고, 같은 날 다른 퀴즈를 새로 열면 잠긴다 */
export function trialCookieValue(now: Date, quizKey: string): string {
  return `${trialDateKey(now)}:${quizKey}`;
}

export function isTrialUsed(cookieValue: string | undefined, now: Date, quizKey?: string): boolean {
  if (!cookieValue) return false;
  const [date, key = ""] = cookieValue.split(":");
  if (date !== trialDateKey(now)) return false;
  return !quizKey || key !== quizKey;
}

/** 퀴즈 주소(검색 매개변수) → 짧은 결정적 키 */
export function quizKeyOf(params: Record<string, string | string[] | undefined>): string {
  const norm = Object.keys(params).sort().map((k) => `${k}=${[params[k]].flat().filter(Boolean).join(",")}`).join("&");
  let h = 2166136261;
  for (const ch of norm) h = (h ^ ch.charCodeAt(0)) * 16777619;
  return (h >>> 0).toString(36);
}
