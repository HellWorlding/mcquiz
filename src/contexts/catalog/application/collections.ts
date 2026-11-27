import { err, ok, type Result } from "@/shared/result";
import type { Collection, CollectionScope } from "../domain/types";
import { resolveCollectionScope } from "../domain/collection";
import { attempt, requireUser } from "./guards";
import type { CatalogDeps } from "./ports";

/** 과목의 묶음 (공용 + 내 것, RLS). 게스트는 없음 */
export async function listCollections(deps: CatalogDeps, subjectId: string): Promise<Collection[]> {
  if (!deps.user) return [];
  return deps.collections.list(subjectId);
}

export async function getCollection(deps: CatalogDeps, id: string): Promise<Collection | null> {
  if (!deps.user) return null;
  return deps.collections.byId(id);
}

/** 묶음별 문항 수 (하위 묶음 미포함) */
export async function questionCountsByCollection(deps: CatalogDeps, subjectId: string): Promise<Map<string, number>> {
  if (!deps.user) return new Map();
  return deps.collections.itemCounts(subjectId);
}

/** 사용자가 쓸 수 있는 묶음 목록 (공용 + 내 것) — 로그인 필요 */
export async function myCollections(deps: CatalogDeps, subjectId: string): Promise<Result<Collection[]>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  return attempt(() => deps.collections.list(subjectId));
}

/** C6. shared 는 관리자만. 일반 사용자의 shared 요청은 private 으로 만든다 */
export async function createCollection(deps: CatalogDeps, input: { subjectId: string; parentId: string | null; title: string; scope: CollectionScope }): Promise<Result<Collection>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  const title = input.title.trim();
  if (!title) return err("묶음 이름을 입력하세요.");
  const scope = resolveCollectionScope(input.scope, g.data);
  return attempt(() => deps.collections.create({ subjectId: input.subjectId, parentId: input.parentId, title, scope, createdBy: g.data.id }));
}

export async function renameCollection(deps: CatalogDeps, id: string, title: string): Promise<Result<void>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  return attempt(() => deps.collections.rename(id, title.trim()));
}

export async function deleteCollection(deps: CatalogDeps, id: string): Promise<Result<void>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  return attempt(() => deps.collections.delete(id));
}

/** 퀴즈 결과·저장함의 "묶음에 추가". 이미 든 문항은 건너뛴다 */
export async function addToCollection(deps: CatalogDeps, collectionId: string, questionIds: string[]): Promise<Result<number>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  if (questionIds.length === 0) return ok(0);
  const r = await attempt(() => deps.collections.addItems(collectionId, questionIds));
  return r.ok ? ok(questionIds.length) : r;
}

export async function removeFromCollection(deps: CatalogDeps, collectionId: string, questionId: string): Promise<Result<void>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  return attempt(() => deps.collections.removeItem(collectionId, questionId));
}
