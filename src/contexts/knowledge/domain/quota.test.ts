import { describe, expect, it } from "vitest";
import { AI_LIMIT_ADMIN, AI_LIMIT_USER, computeQuota, consumeQuota, quotaExceededMessage, quotaLimit } from "./quota";

const now = new Date("2026-11-28T12:00:00Z");
const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString();

describe("K5 AI 한도", () => {
  it("한도는 개인 ai_limit > 관리자 100 > 일반 10", () => {
    expect(quotaLimit({ isAdmin: false, aiLimit: null })).toBe(AI_LIMIT_USER);
    expect(quotaLimit({ isAdmin: true, aiLimit: null })).toBe(AI_LIMIT_ADMIN);
    expect(quotaLimit({ isAdmin: true, aiLimit: 3 })).toBe(3);
    expect(quotaLimit({ isAdmin: false, aiLimit: 50 })).toBe(50);
  });
  it("12시간 창 안의 기록만 세고 resetAt 은 가장 오래된 기록 + 12시간", () => {
    const q = computeQuota(now, [h(13), h(11), h(1)], 10);
    expect(q.used).toBe(2);
    expect(q.remaining).toBe(8);
    expect(q.windowHours).toBe(12);
    expect(q.resetAt).toBe(new Date(now.getTime() + 1 * 3600 * 1000).toISOString());
  });
  it("기록이 없으면 resetAt null, 남은 횟수는 한도 그대로", () => {
    expect(computeQuota(now, [], 10)).toEqual({ limit: 10, used: 0, remaining: 10, windowHours: 12, resetAt: null });
  });
  it("한도를 넘어도 remaining 은 0 아래로 가지 않는다", () => {
    const q = computeQuota(now, [h(1), h(2), h(3)], 2);
    expect(q.remaining).toBe(0);
    expect(consumeQuota(q).remaining).toBe(0);
    expect(quotaExceededMessage(q)).toContain("12시간에 2회");
  });
  it("consumeQuota 는 사용 1 증가, 남은 1 감소", () => {
    expect(consumeQuota({ limit: 10, used: 3, remaining: 7, windowHours: 12, resetAt: null })).toMatchObject({ used: 4, remaining: 6 });
  });
});
