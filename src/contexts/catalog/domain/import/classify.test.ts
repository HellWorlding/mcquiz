import { describe, expect, it } from "vitest";
import { confidenceFromScores, questionTokens, restrictCandidates } from "./classify";

describe("단원 분류 점수", () => {
  it("후보가 없거나 0점이면 0", () => {
    expect(confidenceFromScores([])).toBe(0);
    expect(confidenceFromScores([0, 0])).toBe(0);
  });
  it("후보 하나면 세기만 (3점 이상이면 1)", () => {
    expect(confidenceFromScores([1.5])).toBe(0.5);
    expect(confidenceFromScores([9])).toBe(1);
  });
  it("1위·2위 차이가 클수록 높고, 같으면 세기만 남는다", () => {
    expect(confidenceFromScores([3, 3])).toBe(0.3);
    expect(confidenceFromScores([6, 1])).toBeGreaterThan(confidenceFromScores([3, 2]));
    expect(confidenceFromScores([100, 0.0001])).toBe(1);
  });
  it("토큰은 질문과 선지에서 뽑고, 후보는 allowed 집합으로 거른다", () => {
    expect(questionTokens({ prompt: "학교 경영 계획", choices: [{ text: "장학", explanation: null }] })).toEqual(expect.arrayContaining(["학교", "경영", "장학"]));
    const cands = [{ unitId: "a", score: 2 }, { unitId: "b", score: 1 }];
    expect(restrictCandidates(cands, new Set(["b"]))).toEqual([{ unitId: "b", score: 1 }]);
    expect(restrictCandidates(cands, null)).toBe(cands);
  });
});
