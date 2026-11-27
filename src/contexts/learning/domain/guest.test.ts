import { describe, expect, it } from "vitest";
import { capForGuest, GUEST_TRIAL_LIMIT, isTrialUsed, quizKeyOf, trialCookieValue, trialDateKey } from "./guest";

describe("게스트 체험 (D-009)", () => {
  it("게스트는 N문항까지만, 로그인은 전부", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `q${i}`);
    expect(capForGuest(ids, true)).toHaveLength(GUEST_TRIAL_LIMIT);
    expect(capForGuest(ids, false)).toHaveLength(12);
    expect(capForGuest(["a"], true)).toEqual(["a"]);
  });
  it("같은 날 쿠키면 체험 끝, 다른 날이면 다시 가능 (KST 기준)", () => {
    const now = new Date("2026-11-29T14:59:00Z"); // KST 23:59
    expect(trialDateKey(now)).toBe("2026-11-29");
    expect(trialDateKey(new Date("2026-11-29T15:00:00Z"))).toBe("2026-11-30");
    expect(isTrialUsed("2026-11-29:abc", now)).toBe(true);
    expect(isTrialUsed("2026-11-28:abc", now)).toBe(false);
    expect(isTrialUsed(undefined, now)).toBe(false);
  });
  it("같은 퀴즈는 이어서 풀 수 있고, 다른 퀴즈를 새로 열면 잠긴다", () => {
    const now = new Date("2026-11-29T03:00:00Z");
    const key = quizKeyOf({ subject: "s1", units: "u1,u2" });
    const cookie = trialCookieValue(now, key);
    expect(isTrialUsed(cookie, now, key)).toBe(false);
    expect(isTrialUsed(cookie, now, quizKeyOf({ subject: "s1", set: "x" }))).toBe(true);
    expect(quizKeyOf({ units: ["u1", "u2"], subject: "s1" })).toBe(key); // 순서·배열 무관
  });
});
