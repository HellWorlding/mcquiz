import { describe, expect, it } from "vitest";
import { choicesAreSequential, sortChoices, validateQuestion, validateQuestions } from "./question";

const four = ["가", "나", "다", "라"].map((t) => ({ text: t, explanation: null }));

describe("C1 선지 4~5개 · ord 연속 · 정답 범위", () => {
  it("4지선다·5지선다는 통과하고 값을 다듬는다", () => {
    const r = validateQuestion({ prompt: " 질문? ", choices: four, correct: 2, explanation: " ", hint: "힌트 " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.prompt).toBe("질문?");
      expect(r.value.explanation).toBeNull();
      expect(r.value.hint).toBe("힌트");
    }
    expect(validateQuestion({ prompt: "q", choices: [...four, { text: "마", explanation: null }], correct: 5 }).ok).toBe(true);
  });
  it("3개·6개 선지는 거부", () => {
    expect(validateQuestion({ prompt: "q", choices: four.slice(0, 3), correct: 1 }).ok).toBe(false);
    expect(validateQuestion({ prompt: "q", choices: [...four, ...four.slice(0, 2)], correct: 1 }).ok).toBe(false);
  });
  it("정답은 1..n 또는 null(검토 필요)", () => {
    expect(validateQuestion({ prompt: "q", choices: four, correct: null }).ok).toBe(true);
    expect(validateQuestion({ prompt: "q", choices: four, correct: 0 }).ok).toBe(false);
    expect(validateQuestion({ prompt: "q", choices: four, correct: 5 }).ok).toBe(false);
  });
  it("빈 선지·빈 질문·플레이스홀더 선지는 거부하고 이유를 모은다", () => {
    const r = validateQuestion({ prompt: "", choices: [...four.slice(0, 3), { text: "(선지 없음)", explanation: null }], correct: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toEqual(["질문이 비어 있음", "빈 선지가 있음"]);
  });
  it("validateQuestions 는 통과/실패를 index 와 함께 나눈다", () => {
    const { valid, failed } = validateQuestions([
      { prompt: "a", choices: four, correct: 1 },
      { prompt: "", choices: four, correct: 1 },
    ]);
    expect(valid).toHaveLength(1);
    expect(failed).toEqual([{ index: 1, prompt: "(질문 없음)", reason: "질문이 비어 있음" }]);
  });
  it("ord 연속 검사와 정렬 — 해설은 선지에 붙어 함께 움직인다 (C2)", () => {
    const shuffled = [
      { ord: 3, text: "다", explanation: "다 해설" },
      { ord: 1, text: "가", explanation: null },
      { ord: 2, text: "나", explanation: "나 해설" },
      { ord: 4, text: "라", explanation: null },
    ];
    expect(choicesAreSequential(shuffled)).toBe(false);
    const sorted = sortChoices(shuffled);
    expect(choicesAreSequential(sorted)).toBe(true);
    expect(sorted[2]).toEqual({ ord: 3, text: "다", explanation: "다 해설" });
  });
});
