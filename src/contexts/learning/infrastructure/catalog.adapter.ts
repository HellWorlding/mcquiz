import type { CatalogQuestions, CatalogScope } from "../application/ports";
import type { LearningUnit, QuizQuestion } from "../domain/types";

/**
 * Catalog 공개 API 중 Learning 이 쓰는 부분 (PRD-04 §4 catalog 의 이름·모양을 구조적으로 선언).
 * 실제 CatalogApi 객체를 그대로 넘기면 된다. 이름이 다르면 typecheck 가 이 파일에서 알려 준다.
 */
export type CatalogApiSubset = {
  getSubject(id: string): Promise<{ id: string; name: string } | null>;
  listUnits(subjectId: string): Promise<{ id: string; parentId: string | null; no: number | null; title: string; sort: number; priority: number | null }[]>;
  listSets(subjectId: string): Promise<{ id: string; title: string }[]>;
  questionIds(scope: CatalogScope): Promise<string[]>;
  questionsByIds(ids: string[]): Promise<CatalogQuestionShape[]>;
};

export type CatalogQuestionShape = {
  id: string;
  subjectId: string;
  unitId: string | null;
  setId: string | null;
  ord: number;
  prompt: string;
  choices: { ord: number; text: string; explanation: string | null }[];
  correctChoice: number | null;
  explanation: string | null;
  hint: string | null;
  topic: string | null;
  difficulty: string | null;
  trapTypes: string[];
  tags: string[];
  points: number | null;
  needsReview: boolean;
  sourceQuote: string | null;
  sourcePage: number | null;
  sourceUrl?: string | null;
};

/** Catalog 의 Question(camelCase) → 풀이 화면·내보내기용 QuizQuestion(snake_case) */
export function toQuizQuestion(q: CatalogQuestionShape): QuizQuestion {
  return {
    id: q.id,
    subject_id: q.subjectId,
    unit_id: q.unitId,
    set_id: q.setId,
    ord: q.ord,
    prompt: q.prompt,
    correct_choice: q.correctChoice,
    explanation: q.explanation,
    hint: q.hint,
    topic: q.topic,
    difficulty: q.difficulty,
    trap_types: q.trapTypes ?? [],
    tags: q.tags ?? [],
    points: q.points,
    needs_review: q.needsReview,
    source_quote: q.sourceQuote,
    source_page: q.sourcePage,
    source_url: q.sourceUrl ?? null,
    choices: [...q.choices].sort((a, b) => a.ord - b.ord).map((c) => ({ ord: c.ord, text: c.text, explanation: c.explanation })),
  };
}

export function toLearningUnit(u: Awaited<ReturnType<CatalogApiSubset["listUnits"]>>[number]): LearningUnit {
  return { id: u.id, parent_id: u.parentId, no: u.no, title: u.title, sort: u.sort, priority: u.priority };
}

/** CatalogQuestions 포트 구현 */
export function catalogQuestions(catalog: CatalogApiSubset): CatalogQuestions {
  return {
    async questionsByIds(ids) {
      if (ids.length === 0) return [];
      return (await catalog.questionsByIds(ids)).map(toQuizQuestion);
    },
    questionIds: (scope) => catalog.questionIds(scope),
    async listUnits(subjectId) {
      return (await catalog.listUnits(subjectId)).map(toLearningUnit);
    },
    listSets: (subjectId) => catalog.listSets(subjectId),
    getSubject: (id) => catalog.getSubject(id),
  };
}
