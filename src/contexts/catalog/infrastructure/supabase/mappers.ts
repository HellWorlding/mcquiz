import type { Row } from "@/shared/db/types";
import type { Choice, Collection, CollectionScope, Question, QuestionSet, Subject, Unit, Visibility } from "../../domain/types";

export const toSubject = (r: Row<"catalog", "subjects">): Subject => ({ id: r.id, name: r.name, visibility: r.visibility as Visibility, createdAt: r.created_at });

export const toUnit = (r: Row<"catalog", "units">): Unit => ({ id: r.id, subjectId: r.subject_id, parentId: r.parent_id, no: r.no, title: r.title, sort: r.sort, priority: r.priority });

export const toChoice = (r: Pick<Row<"catalog", "choices">, "ord" | "text" | "explanation">): Choice => ({ ord: r.ord, text: r.text, explanation: r.explanation });

export const toQuestion = (r: Row<"catalog", "questions"> & { choices?: Pick<Row<"catalog", "choices">, "ord" | "text" | "explanation">[] | null }): Question => ({
  id: r.id,
  subjectId: r.subject_id,
  unitId: r.unit_id,
  setId: r.set_id,
  ord: r.ord,
  prompt: r.prompt,
  choices: [...(r.choices ?? [])].sort((a, b) => a.ord - b.ord).map(toChoice),
  correctChoice: r.correct_choice,
  explanation: r.explanation,
  hint: r.hint,
  topic: r.topic,
  difficulty: r.difficulty,
  trapTypes: r.trap_types ?? [],
  tags: r.tags ?? [],
  points: r.points,
  needsReview: r.needs_review,
  unitConfidence: r.unit_confidence,
  sourceQuote: r.source_quote,
  sourcePage: r.source_page,
});

export const toSet = (r: Row<"catalog", "question_sets"> & { questions?: { count: number }[] | null }): QuestionSet => ({
  id: r.id,
  subjectId: r.subject_id,
  title: r.title,
  sourceFilename: r.source_filename,
  createdBy: r.created_by,
  createdAt: r.created_at,
  ...(r.questions ? { questionCount: r.questions[0]?.count ?? 0 } : {}),
});

export const toCollection = (r: Row<"catalog", "collections">): Collection => ({
  id: r.id,
  subjectId: r.subject_id,
  parentId: r.parent_id,
  title: r.title,
  sort: r.sort,
  scope: r.scope as CollectionScope,
  createdBy: r.created_by,
});

export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null) throw new Error("데이터가 없습니다.");
  return res.data;
}

export function check(res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message);
}
