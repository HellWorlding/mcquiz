import { describe, expect, it } from "vitest";
import { capForGuest, GUEST_TRIAL_LIMIT, isTrialUsed, trialDateKey } from "./guest";

describe("게스트 체험 (D-009)", () => {
  it("게스트는 N문항까지만, 로그인은 전부", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `q${i}`);
    expect(capForGuest(ids, true)).toHaveLength(GUEST_TRIAL_LIMIT);
    expect(capForGuest(ids, false)).toHaveLength(12);
    expect(capForGuest(["a"], true)).toEqual(["a"]);
  });
  it("같은 날 쿠키면 체험 끝, 다른 날이면 다시 가능", () => {
    const now = new Date(2026, 10, 29, 23, 59);
    expect(trialDateKey(now)).toBe("2026-11-29");
    expect(isTrialUsed("2026-11-29", now)).toBe(true);
    expect(isTrialUsed("2026-11-28", now)).toBe(false);
    expect(isTrialUsed(undefined, now)).toBe(false);
  });
});
