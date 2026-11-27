import { describe, expect, it } from "vitest";
import { findDuplicatePrompts, normalizePrompt, planImport } from "./dedupe";
import { emptyQuestion, type PreviewQuestion } from "./types";

const pq = (prompt: string, unitId: string | null, no: number | null = null): PreviewQuestion => ({
  ...emptyQuestion(no),
  prompt,
  key: prompt,
  unitId,
  unitConfidence: 1,
  unitCandidates: [],
});

describe("C7 반입 중복 판정", () => {
  it("normalizePrompt 는 공백·대소문자를 무시한다", () => {
    expect(normalizePrompt(" Make a  Decision ")).toBe(normalizePrompt("makeadecision"));
  });
  it("같은 과목·같은 단원·같은 질문문은 덮어쓰고, 다른 단원이면 새로 넣는다", () => {
    const existing = { byFilePos: [], byPrompt: [{ id: "q1", unitId: "u1", prompt: "질문?" }] };
    const r = planImport([pq("질문?", "u1"), pq("질문?", "u2")], existing);
    expect(r.toUpdate.map((x) => x.id)).toEqual(["q1"]);
    expect(r.toInsert.map((x) => x.unitId)).toEqual(["u2"]);
  });
  it("같은 파일의 같은 단원·같은 번호는 질문문이 바뀌어도 같은 문항", () => {
    const existing = { byFilePos: [{ id: "q7", unitId: "u1", ord: 7 }], byPrompt: [] };
    const r = planImport([pq("새 질문문", "u1", 7)], existing);
    expect(r.toUpdate).toEqual([{ id: "q7", q: expect.objectContaining({ prompt: "새 질문문" }) }]);
  });
  it("기존 문항 하나는 한 번만 덮어쓴다", () => {
    const existing = { byFilePos: [], byPrompt: [{ id: "q1", unitId: null, prompt: "같은 질문" }] };
    const r = planImport([pq("같은 질문", null), pq("같은 질문", null)], existing);
    expect(r.toUpdate).toHaveLength(1);
    expect(r.toInsert).toHaveLength(1);
  });
  it("번호가 없으면 순서(i+1)를 번호로 쓴다", () => {
    const existing = { byFilePos: [{ id: "q2", unitId: null, ord: 2 }], byPrompt: [] };
    const r = planImport([pq("a", null), pq("b", null)], existing);
    expect(r.toUpdate.map((x) => x.q.prompt)).toEqual(["b"]);
  });
  it("새로 넣을 문항에는 분리 전에 정한 번호가 no 로 남는다 (명시한 번호는 그대로)", () => {
    const existing = { byFilePos: [{ id: "q1", unitId: null, ord: 1 }], byPrompt: [] };
    const r = planImport([pq("a", null), pq("b", null), pq("c", null, 9)], existing);
    expect(r.toInsert.map((x) => [x.prompt, x.no])).toEqual([["b", 2], ["c", 9]]);
  });
  it("findDuplicatePrompts 는 정규화 비교로 기존 문항과 겹치는 질문문을 돌려준다", () => {
    expect(findDuplicatePrompts([{ prompt: "Make a decision" }, { prompt: "새 질문" }], ["make a  decision"])).toEqual(["Make a decision"]);
  });
});
