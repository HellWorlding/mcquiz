import { describe, expect, it } from "vitest";
import { emptyStat, matchesFilter, savedBoxFilter, savedBoxItems, summarizeSavedBox } from "./saved-box";
import type { QuestionStat } from "./types";

const st = (id: string, over: Partial<QuestionStat> = {}): QuestionStat => ({ ...emptyStat(id), ...over });

const wrong = st("w", { attemptCount: 1, wrongCount: 1, lastCorrect: false, wrongAfter: true, lastWeakAt: "2026-01-02" });
const wrongTwice = st("w2", { attemptCount: 3, wrongCount: 2, lastCorrect: true, wrongAfter: true, lastWeakAt: "2026-01-01" });
const confused = st("c", { attemptCount: 1, wrongCount: 0, lastCorrect: true, confusedAfter: true, lastWeakAt: "2026-01-03" });
const saved = st("s", { attemptCount: 0, saved: true, lastWeakAt: "2026-01-04" });
const dismissed = st("d", { attemptCount: 2, wrongCount: 1, lastCorrect: true, wrongAfter: false, confusedAfter: false, saved: false });
const solvedOk = st("ok", { attemptCount: 1, lastCorrect: true });
const all = [wrong, wrongTwice, confused, saved, dismissed, solvedOk];

describe("L4 저장함 집합", () => {
  it("weak = 틀림 ∪ 헷갈림 ∪ 직접 저장 − 빼기", () => {
    expect(savedBoxFilter(all, "weak").map((s) => s.questionId).sort()).toEqual(["c", "s", "w", "w2"]);
  });
  it("빼기(dismissed) 뒤에는 기록이 있어도 저장함에 없다", () => {
    expect(matchesFilter(dismissed, "weak")).toBe(false);
    expect(matchesFilter(dismissed, "wrong")).toBe(false);
    // wrong_count 는 기록이라 남는다 (repeat 는 누적 횟수 기준)
    expect(matchesFilter(st("x", { wrongCount: 2 }), "repeat")).toBe(true);
  });
  it("개별 필터", () => {
    expect(savedBoxFilter(all, "wrong").map((s) => s.questionId)).toEqual(["w2", "w"]);
    expect(savedBoxFilter(all, "repeat").map((s) => s.questionId)).toEqual(["w2"]);
    expect(savedBoxFilter(all, "confused").map((s) => s.questionId)).toEqual(["c"]);
    expect(savedBoxFilter(all, "saved").map((s) => s.questionId)).toEqual(["s"]);
    expect(savedBoxFilter(all, "all")).toHaveLength(6);
  });
  it("unsolved: 통계가 없거나 풀이 0회 (직접 저장만 한 문항 포함)", () => {
    expect(matchesFilter(undefined, "unsolved")).toBe(true);
    expect(savedBoxFilter(all, "unsolved").map((s) => s.questionId)).toEqual(["s"]);
    expect(matchesFilter(undefined, "weak")).toBe(false);
  });
  it("정렬: 많이 틀린 순 → 최근 약점 순", () => {
    expect(savedBoxFilter(all, "weak").map((s) => s.questionId)).toEqual(["w2", "w", "s", "c"]);
  });
  it("savedBoxItems 는 이유 배지를 붙이고 빼기·정상 풀이는 빠진다", () => {
    const items = savedBoxItems(all);
    expect(items.map((i) => i.questionId)).toEqual(["w2", "w", "s", "c"]);
    expect(items.find((i) => i.questionId === "w2")?.reasons).toEqual(["wrong"]);
    expect(items.find((i) => i.questionId === "s")?.reasons).toEqual(["saved"]);
    const both = savedBoxItems([st("b", { wrongAfter: true, confusedAfter: true, saved: true })])[0];
    expect(both.reasons).toEqual(["wrong", "confused", "saved"]);
  });
});

describe("summarizeSavedBox", () => {
  const units = [
    { id: "top", parent_id: null, no: null, title: "대단원", sort: 0, priority: null },
    { id: "leaf", parent_id: "top", no: 2, title: "소단원", sort: 1, priority: null },
  ];
  const stats = [
    st("a", { unitId: "leaf", setId: "set1", attemptCount: 2, wrongCount: 1, lastCorrect: true, wrongAfter: true, topic: "T", difficulty: "hard", trapTypes: ["reversal"], tags: ["x"] }),
    st("b", { unitId: "leaf", setId: "set1", attemptCount: 1, wrongCount: 0, lastCorrect: false, wrongAfter: true, confusedAfter: true }),
    st("c", { unitId: null, attemptCount: 1, lastCorrect: true }),
  ];
  const s = summarizeSavedBox(stats, units, [{ id: "set1", title: "세트 1" }]);
  it("최근 풀이 기준 정답률과 풀이 문항 수", () => {
    expect(s.totalAttempts).toBe(3);
    expect(s.accuracy).toBeCloseTo(2 / 3);
    expect(s.attemptCounts).toEqual({ a: 2, b: 1, c: 1 });
  });
  it("대단원·단원·세트 라벨", () => {
    expect(s.byGroup.map((g) => g.label)).toEqual(["대단원", "단원 미지정"]);
    expect(s.byUnit[0]).toMatchObject({ key: "leaf", label: "대단원 › 2. 소단원", total: 2, correct: 1, weak: 2 });
    expect(s.bySet[0]).toMatchObject({ label: "세트 1", total: 2 });
    expect(s.byTag[0].label).toBe("#x");
    expect(s.byTrap[0].label).toBe("순서·관계 뒤집기");
    expect(s.byDifficulty[0].label).toBe("상");
  });
  it("목록과 이유별 id", () => {
    expect(s.items.map((i) => i.questionId)).toEqual(["a", "b"]);
    expect(s.wrongIds).toEqual(["a", "b"]);
    expect(s.confusedIds).toEqual(["b"]);
  });
});
