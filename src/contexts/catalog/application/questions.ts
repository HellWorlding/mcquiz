import { err, type Result } from "@/shared/result";
import type { Question, QuestionScope, QuestionSet } from "../domain/types";
import { collectionSubtreeIds } from "../domain/collection";
import { attempt, requireAdmin } from "./guards";
import type { CatalogDeps, ChoicePatch } from "./ports";

/** 범위에 해당하는 문항 id 목록 (세트 순서 / 단원 순서대로). "units" 는 하위 단원 포함 */
export async function questionIds(deps: CatalogDeps, scope: QuestionScope): Promise<string[]> {
  switch (scope.kind) {
    case "set":
      return deps.questions.idsBySet(scope.setId);
    case "units": {
      if (scope.unitIds.length === 0) return [];
      const all = await deps.units.subtree(scope.unitIds);
      if (all.length === 0) return [];
      const rows = await deps.questions.idsInUnits(scope.subjectId, all);
      // 단원 순서(선택 순서 → 하위 순서)대로 정렬. 같은 단원 안에서는 리포지토리의 세트·번호 순서 유지
      const unitOrder = new Map(all.map((id, i) => [id, i]));
      return rows.sort((a, b) => (unitOrder.get(a.unitId ?? "") ?? 0) - (unitOrder.get(b.unitId ?? "") ?? 0)).map((r) => r.id);
    }
    case "collection": {
      const ids = collectionSubtreeIds(await deps.collections.allRefs(), scope.collectionId);
      return [...new Set(await deps.collections.itemIds(ids))];
    }
    case "subject":
      return deps.questions.idsInSubject(scope.subjectId);
    case "ids":
      return scope.ids;
  }
}

/** 문항 + 선지를 id 순서 그대로 (RLS 적용) */
export async function questionsByIds(deps: CatalogDeps, ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return [];
  const out: Question[] = [];
  // in() 길이 제한을 피하려고 200개씩 나눠 조회
  for (let i = 0; i < ids.length; i += 200) out.push(...(await deps.questions.byIds(ids.slice(i, i + 200))));
  const order = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** 질문문·해설 글자 검색 (중복 확인용) */
export async function searchQuestions(deps: CatalogDeps, subjectId: string, text: string, limit = 20) {
  const q = text.trim();
  if (!q) return [];
  return deps.questions.search(subjectId, q, limit);
}

export async function listSets(deps: CatalogDeps, subjectId: string): Promise<QuestionSet[]> {
  return deps.sets.list(subjectId);
}

export async function listAllSets(deps: CatalogDeps): Promise<QuestionSet[]> {
  return deps.sets.listAll();
}

export async function getSet(deps: CatalogDeps, id: string): Promise<QuestionSet | null> {
  return deps.sets.byId(id);
}

export type UpdateQuestionInput = {
  id: string;
  prompt?: string;
  unitId?: string | null;
  correctChoice?: number | null;
  explanation?: string | null;
  hint?: string | null;
  tags?: string[];
  needsReview?: boolean;
};

export async function updateQuestion(deps: CatalogDeps, input: UpdateQuestionInput): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const patch: Parameters<CatalogDeps["questions"]["update"]>[1] = {};
  if (input.prompt !== undefined) patch.prompt = input.prompt.trim();
  if (input.unitId !== undefined) {
    patch.unitId = input.unitId;
    patch.unitConfidence = input.unitId ? 1 : null;
  }
  if (input.correctChoice !== undefined) {
    patch.correctChoice = input.correctChoice;
    patch.needsReview = input.correctChoice === null;
  }
  if (input.explanation !== undefined) patch.explanation = input.explanation?.trim() || null;
  if (input.hint !== undefined) patch.hint = input.hint?.trim() || null;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.needsReview !== undefined) patch.needsReview = input.needsReview;
  return attempt(() => deps.questions.update(input.id, patch));
}

export async function updateChoice(deps: CatalogDeps, questionId: string, ord: number, input: { text?: string; explanation?: string | null }): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const patch: ChoicePatch = {};
  if (input.text !== undefined) patch.text = input.text.trim();
  if (input.explanation !== undefined) patch.explanation = input.explanation?.trim() || null;
  return attempt(() => deps.questions.updateChoice(questionId, ord, patch));
}

export async function deleteQuestion(deps: CatalogDeps, id: string): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  return attempt(() => deps.questions.delete(id));
}

/** C5. 세트 삭제는 그 세트의 문항·선지를 함께 지운다 (FK cascade) */
export async function deleteSet(deps: CatalogDeps, id: string): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  if (!id) return err("세트를 찾을 수 없습니다.");
  return attempt(() => deps.sets.delete(id));
}
