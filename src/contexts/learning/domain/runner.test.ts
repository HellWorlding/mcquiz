import { describe, expect, it } from "vitest";
import { carriedConfusedIds, firstUnansweredIndex, questionNumberLabel, questionNumbers, unansweredCount, visibleMarks } from "./runner";

describe("원래 문항 번호", () => {
  it("단원번호.문항번호", () => {
    expect(questionNumberLabel(1, 12)).toBe("1.12");
    expect(questionNumberLabel(0, 3)).toBe("0.3");
  });
  it("단원이 없거나 no 가 null 이면 ord 만", () => {
    expect(questionNumberLabel(null, 7)).toBe("7");
    expect(questionNumberLabel(undefined, 7)).toBe("7");
  });
  it("문항 id → 라벨 (그 문항이 속한 단원의 no)", () => {
    const nos = new Map<string, number | null>([
      ["u1", 2],
      ["u2", null],
    ]);
    expect(
      questionNumbers(
        [
          { id: "a", unit_id: "u1", ord: 5 },
          { id: "b", unit_id: "u2", ord: 6 },
          { id: "c", unit_id: null, ord: 1 },
          { id: "d", unit_id: "missing", ord: 9 },
        ],
        nos,
      ),
    ).toEqual({ a: "2.5", b: "6", c: "1", d: "9" });
  });
});

describe("빼기가 저장·헷갈림을 덮는다", () => {
  it("빼기 상태면 둘 다 꺼진 것으로", () => {
    expect(visibleMarks(true, true, true)).toEqual({ saved: false, confused: false });
  });
  it("빼기가 아니면 원래 값 (되돌리기 → 원래 표시)", () => {
    expect(visibleMarks(true, false, false)).toEqual({ saved: true, confused: false });
    expect(visibleMarks(false, true, false)).toEqual({ saved: false, confused: true });
  });
});

describe("미응답", () => {
  const ids = ["q1", "q2", "q3", "q4"];
  it("답을 고르지 않은 문항만 센다 (헷갈림만 누른 문항도 미응답)", () => {
    const answers = { q1: { selectedOrd: 2 }, q2: { selectedOrd: null }, q4: { selectedOrd: 1 } };
    expect(unansweredCount(ids, answers)).toBe(2);
    expect(firstUnansweredIndex(ids, answers)).toBe(1);
  });
  it("다 풀었으면 0 / -1", () => {
    const answers = { q1: { selectedOrd: 1 }, q2: { selectedOrd: 1 }, q3: { selectedOrd: 1 }, q4: { selectedOrd: 1 } };
    expect(unansweredCount(ids, answers)).toBe(0);
    expect(firstUnansweredIndex(ids, answers)).toBe(-1);
  });
  it("아무것도 안 풀었으면 첫 문항", () => {
    expect(firstUnansweredIndex(ids, {})).toBe(0);
    expect(unansweredCount(ids, {})).toBe(4);
  });
});

describe("헷갈림은 다시 끄기 전까지 유지", () => {
  it("confusedAfter 이고 최근 풀이도 헷갈림이면 이어진다", () => {
    const stats = [
      { questionId: "a", confusedAfter: true },
      { questionId: "b", confusedAfter: true },
      { questionId: "c", confusedAfter: false },
    ];
    const attempts = [
      { questionId: "a", confused: true },
      { questionId: "b", confused: true },
      { questionId: "b", confused: false }, // 최근 풀이에서 껐다
      { questionId: "c", confused: true }, // 빼기 이전 표시 (confusedAfter false)
    ];
    expect(carriedConfusedIds(stats, attempts)).toEqual(["a"]);
  });
  it("풀이 기록이 없으면 이어지지 않는다", () => {
    expect(carriedConfusedIds([{ questionId: "a", confusedAfter: true }], [])).toEqual([]);
  });
});
