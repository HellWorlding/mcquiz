import type { Collection, CollectionScope } from "./types";

type Actor = { id: string; isAdmin: boolean };

/** C6. shared 묶음은 관리자만 만든다. 그 외 요청은 private 으로 내려간다 */
export function resolveCollectionScope(requested: CollectionScope, actor: Actor): CollectionScope {
  return requested === "shared" && actor.isAdmin ? "shared" : "private";
}

/** C6. private 묶음은 만든 사람만, shared 묶음은 관리자만 고친다 (RLS 가 최종 결정, 화면·테스트용) */
export function canEditCollection(col: Pick<Collection, "scope" | "createdBy">, actor: Actor | null): boolean {
  if (!actor) return false;
  if (actor.isAdmin) return true;
  return col.scope === "private" && col.createdBy === actor.id;
}

/** 묶음과 그 하위 묶음 id 전부 */
export function collectionSubtreeIds(all: Pick<Collection, "id" | "parentId">[], rootId: string): string[] {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return [...ids];
}
