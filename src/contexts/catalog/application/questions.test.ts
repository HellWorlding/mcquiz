import { describe, expect, it } from "vitest";
import { admin, fakeDeps, unit, user } from "./fakes.test-util";
import { questionIds, questionsByIds, searchQuestions, updateChoice, updateQuestion } from "./questions";
import type { Question } from "../domain/types";

const q = (id: string, unitId: string | null, setId: string, ord: number): Question => ({
  id, subjectId: "s", unitId, setId, ord, prompt: `질문 ${id}`, choices: [{ ord: 1, text: "가", explanation: null }, { ord: 2, text: "나", explanation: "나 해설" }, { ord: 3, text: "다", explanation: null }, { ord: 4, text: "라", explanation: null }],
  correctChoice: 2, explanation: "해설", hint: null, topic: null, difficulty: null, trapTypes: [], tags: [], points: null, needsReview: false, unitConfidence: 1, sourceQuote: null, sourcePage: null,
});
const units = [unit("top", "s", null, 1, "T"), unit("a", "s", "top", 1, "A"), unit("b", "s", "top", 2, "B")];
const questions = [q("q3", "b", "set1", 3), q("q1", "a", "set1", 1), q("q2", "a", "set2", 1), q("q4", null, "set2", 2)];

describe("questions use cases", () => {
  it("questionIds: 세트는 번호 순, 과목은 세트→번호 순, 단원은 선택 순서(하위 포함), ids 는 그대로", async () => {
    const f = fakeDeps(user, { units, questions });
    expect(await questionIds(f.deps, { kind: "set", setId: "set1" })).toEqual(["q1", "q3"]);
    expect(await questionIds(f.deps, { kind: "subject", subjectId: "s" })).toEqual(["q1", "q3", "q2", "q4"]);
    expect(await questionIds(f.deps, { kind: "units", subjectId: "s", unitIds: ["b", "a"] })).toEqual(["q3", "q1", "q2"]);
    expect(await questionIds(f.deps, { kind: "units", subjectId: "s", unitIds: ["top"] })).toEqual(["q1", "q2", "q3"]);
    expect(await questionIds(f.deps, { kind: "units", subjectId: "s", unitIds: [] })).toEqual([]);
    expect(await questionIds(f.deps, { kind: "ids", ids: ["q4", "q1"] })).toEqual(["q4", "q1"]);
  });
  it("questionsByIds 는 요청 순서를 지키고 선지를 포함한다", async () => {
    const f = fakeDeps(user, { questions });
    const r = await questionsByIds(f.deps, ["q4", "q1"]);
    expect(r.map((x) => x.id)).toEqual(["q4", "q1"]);
    expect(r[1].choices[1]).toEqual({ ord: 2, text: "나", explanation: "나 해설" });
    expect(await questionsByIds(f.deps, [])).toEqual([]);
  });
  it("searchQuestions 는 빈 질의면 빈 결과", async () => {
    const f = fakeDeps(user, { questions });
    expect(await searchQuestions(f.deps, "s", "  ")).toEqual([]);
    expect((await searchQuestions(f.deps, "s", "q1")).map((x) => x.id)).toEqual(["q1"]);
  });
  it("updateQuestion/updateChoice 는 관리자만, 단원 변경 시 신뢰도 1, 정답 없음이면 needsReview", async () => {
    expect((await updateQuestion(fakeDeps(user, { questions }).deps, { id: "q1", prompt: "x" })).ok).toBe(false);
    const f = fakeDeps(admin, { questions });
    await updateQuestion(f.deps, { id: "q1", prompt: " 새 질문 ", unitId: "b", correctChoice: null, explanation: " ", tags: ["t"] });
    expect(f.questions.find((x) => x.id === "q1")).toMatchObject({ prompt: "새 질문", unitId: "b", unitConfidence: 1, correctChoice: null, needsReview: true, explanation: null, tags: ["t"] });
    await updateQuestion(f.deps, { id: "q1", unitId: null });
    expect(f.questions.find((x) => x.id === "q1")).toMatchObject({ unitId: null, unitConfidence: null });
    await updateChoice(f.deps, "q1", 2, { text: " 나2 ", explanation: "" });
    expect(f.questions.find((x) => x.id === "q1")!.choices[1]).toEqual({ ord: 2, text: "나2", explanation: null });
  });
});
