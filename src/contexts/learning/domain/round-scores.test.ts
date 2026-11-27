import { describe, expect, it } from "vitest";
import { roundScores, toUnitRoundScores, type RoundAttempt } from "./round-scores";

const at = (id: string, questionId: string, unitId: string | null, isCorrect: boolean | null, createdAt: string, selectedOrd: number | null = 1): RoundAttempt => ({
  id,
  questionId,
  unitId,
  isCorrect,
  createdAt,
  selectedOrd,
});

describe("L3 회독 점수", () => {
  it("문항을 3번 푼 사용자는 1·2·3회독에 각각 1회 기여", () => {
    const rows = roundScores([at("a", "q1", "u", false, "2026-01-01"), at("b", "q1", "u", true, "2026-01-02"), at("c", "q1", "u", true, "2026-01-03")]);
    expect(rows).toEqual([
      { unitId: "u", roundNo: 1, n: 1, nCorrect: 0 },
      { unitId: "u", roundNo: 2, n: 1, nCorrect: 1 },
      { unitId: "u", roundNo: 3, n: 1, nCorrect: 1 },
    ]);
  });
  it("같은 단원의 문항은 회독별로 합산된다", () => {
    const rows = roundScores([
      at("a", "q1", "u", true, "2026-01-01"),
      at("b", "q2", "u", false, "2026-01-01"),
      at("c", "q1", "u", true, "2026-01-05"),
    ]);
    expect(rows).toEqual([
      { unitId: "u", roundNo: 1, n: 2, nCorrect: 1 },
      { unitId: "u", roundNo: 2, n: 1, nCorrect: 1 },
    ]);
  });
  it("채점되지 않은 풀이(헷갈림만 표시)는 회독에 들지 않는다", () => {
    const rows = roundScores([at("a", "q1", "u", null, "2026-01-01", null), at("b", "q1", "u", true, "2026-01-02")]);
    expect(rows).toEqual([{ unitId: "u", roundNo: 1, n: 1, nCorrect: 1 }]);
  });
  it("k번째는 시각 순(같으면 id 순)으로 정한다", () => {
    const rows = roundScores([at("b", "q1", "u", true, "2026-01-01T00:00:00Z"), at("a", "q1", "u", false, "2026-01-01T00:00:00Z")]);
    expect(rows).toEqual([
      { unitId: "u", roundNo: 1, n: 1, nCorrect: 0 },
      { unitId: "u", roundNo: 2, n: 1, nCorrect: 1 },
    ]);
  });
  it("단원이 없는 문항은 unitId null 로 묶인다; 화면용 변환은 __none__", () => {
    const rows = roundScores([at("a", "q1", null, true, "2026-01-01")]);
    expect(rows).toEqual([{ unitId: null, roundNo: 1, n: 1, nCorrect: 1 }]);
    expect(toUnitRoundScores(rows)).toEqual({ __none__: { 1: { n: 1, correct: 1 } } });
  });
});
