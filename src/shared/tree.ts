/** parent_id 로 연결된 평면 목록을 트리로 바꾼다. units / collections 공용. */
export type TreeNode<T> = T & { children: TreeNode<T>[]; depth: number };

export function buildTree<T extends { id: string; parent_id: string | null; sort: number; no?: number | null }>(
  rows: T[],
): TreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const r of rows) {
    const list = byParent.get(r.parent_id) ?? [];
    list.push(r);
    byParent.set(r.parent_id, list);
  }
  const sortFn = (a: T, b: T) =>
    a.sort - b.sort || (a.no ?? 0) - (b.no ?? 0) || String(a.id).localeCompare(String(b.id));
  const build = (parent: string | null, depth: number): TreeNode<T>[] =>
    (byParent.get(parent) ?? [])
      .sort(sortFn)
      .map((r) => ({ ...r, depth, children: build(r.id, depth + 1) }));
  return build(null, 0);
}

export function flattenTree<T>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  const walk = (n: TreeNode<T>[]) => {
    for (const x of n) {
      out.push(x);
      walk(x.children);
    }
  };
  walk(nodes);
  return out;
}

export function subtreeIds<T extends { id: string }>(node: TreeNode<T>): string[] {
  return [node.id, ...node.children.flatMap(subtreeIds)];
}
