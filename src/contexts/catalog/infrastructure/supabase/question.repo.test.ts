import { describe, expect, it } from "vitest";
import type { QuestionInsert } from "../../application/ports";
import { decodeEnvelope, encodeEnvelope } from "../envelope";
import { importPayload } from "./question.repo";

const q = (prompt: string, patch: Partial<QuestionInsert> = {}): QuestionInsert => ({
  subjectId: "s",
  unitId: "u",
  unitConfidence: 1,
  prompt,
  choices: [1, 2, 3, 4].map((ord) => ({ ord, text: `선지 ${ord}`, explanation: ord === 2 ? "정답 해설" : null })),
  correct: 2,
  explanation: "해설",
  hint: null,
  tags: ["t"],
  points: null,
  topic: "주제",
  difficulty: "hard",
  trapTypes: ["concept_swap"],
  sourceQuote: null,
  sourcePage: 12,
  needsReview: true,
  ...patch,
});

describe("importPayload — catalog.apply_import 봉투 내용", () => {
  it("세트·새 문항(ord)·덮어쓰기(id)를 snake_case 열로, 선지 해설은 선지에 붙여 보낸다", () => {
    const p = importPayload({ subjectId: "s", set: { id: null, title: "세트", sourceFilename: "a.json", createdBy: null }, inserts: [{ ...q("새"), ord: 3 }], updates: [{ id: "q1", q: q("옛", { correct: null }) }] });
    expect(p.subject_id).toBe("s");
    expect(p.set).toEqual({ id: null, title: "세트", source_filename: "a.json", created_by: null });
    expect(p.inserts[0]).toMatchObject({ ord: 3, prompt: "새", unit_id: "u", correct_choice: 2, needs_review: true, trap_types: ["concept_swap"], source_page: 12 });
    expect(p.inserts[0].choices[1]).toEqual({ ord: 2, text: "선지 2", explanation: "정답 해설" });
    expect(p.updates[0]).toMatchObject({ id: "q1", prompt: "옛", correct_choice: null });
    expect(p.updates[0]).not.toHaveProperty("ord");
    expect(decodeEnvelope(encodeEnvelope(p))).toEqual(JSON.parse(JSON.stringify(p)));
  });
});
