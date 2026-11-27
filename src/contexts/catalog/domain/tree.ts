import type { TreeNode } from "@/shared/tree";

export type { TreeNode };
export { flattenTree, subtreeIds } from "@/shared/tree";

/** parentId 로 연결된 평면 목록 → 트리. 정렬은 sort → no → id (shared/tree 의 buildTree 와 같은 규칙, camelCase 용) */
export function buildTree<T extends { id: string; parentId: string | null; sort: number; no?: number | null }>(rows: T[]): TreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const r of rows) {
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  const sortFn = (a: T, b: T) => a.sort - b.sort || (a.no ?? 0) - (b.no ?? 0) || String(a.id).localeCompare(String(b.id));
  const build = (parent: string | null, depth: number): TreeNode<T>[] =>
    (byParent.get(parent) ?? []).sort(sortFn).map((r) => ({ ...r, depth, children: build(r.id, depth + 1) }));
  return build(null, 0);
}
