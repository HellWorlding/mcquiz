import type { CatalogApi } from "@/contexts/catalog";
import type { QuestionExists, QuestionSummaries } from "../application/ports";

/** Catalog 공개 API → 문항 존재 확인·요약 포트. RLS 로 못 읽는 문항은 "없는" 것으로 본다 */
export function catalogQuestions(catalog: CatalogApi): QuestionExists & QuestionSummaries {
  return {
    async exists(questionId) {
      const qs = await catalog.questionsByIds([questionId]);
      return qs.length > 0;
    },
    async summaries(ids) {
      const qs = await catalog.questionsByIds(ids);
      return qs.map((q) => ({ id: q.id, prompt: q.prompt, setId: q.setId }));
    },
  };
}
