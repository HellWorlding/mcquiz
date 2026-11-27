import type { Question } from "../../domain/types";
import type { PreviewQuestion } from "../../domain/import/types";

/** shared/ui/QuestionMeta 는 DB 행 모양(snake_case)을 받는다 — 도메인 타입을 그 모양으로 */
export const metaOf = (q: Question) => ({
  difficulty: q.difficulty,
  topic: q.topic,
  trap_types: q.trapTypes,
  source_quote: q.sourceQuote,
  points: q.points,
  source_page: q.sourcePage,
  subject_id: q.subjectId,
  unit_id: q.unitId,
});

export const previewMetaOf = (q: PreviewQuestion) => ({ difficulty: q.difficulty, topic: q.topic, trap_types: q.trapTypes, source_quote: q.sourceQuote });
