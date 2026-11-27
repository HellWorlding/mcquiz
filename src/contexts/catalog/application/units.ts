import { err, ok, type Result } from "@/shared/result";
import type { Unit } from "../domain/types";
import { buildTree, type TreeNode } from "../domain/tree";
import { bulkUnitRows, moveSibling, nextSort, sortSiblings } from "../domain/unit";
import { attempt, requireAdmin } from "./guards";
import type { CatalogDeps } from "./ports";

export async function listUnits(deps: CatalogDeps, subjectId: string): Promise<Unit[]> {
  return deps.units.list(subjectId);
}

export async function unitTree(deps: CatalogDeps, subjectId: string): Promise<TreeNode<Unit>[]> {
  return buildTree(await deps.units.list(subjectId));
}

/** 선택한 단원들의 하위 단원 id 를 모두 포함해 돌려준다 */
export async function expandUnitIds(deps: CatalogDeps, unitIds: string[]): Promise<string[]> {
  if (unitIds.length === 0) return [];
  return deps.units.subtree(unitIds);
}

/** 단원별 문항 수 (하위 단원 미포함, 화면에서 합산). 단원 없는 문항은 "__none__" */
export async function questionCountsByUnit(deps: CatalogDeps, subjectId: string): Promise<Map<string, number>> {
  const rows = await deps.units.questionCounts(subjectId);
  return new Map(rows.map((r) => [r.unitId ?? "__none__", r.n]));
}

export async function createUnit(deps: CatalogDeps, input: { subjectId: string; parentId: string | null; title: string; no: number | null }): Promise<Result<Unit>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const title = input.title.trim();
  if (!title) return err("단원 이름을 입력하세요.");
  return attempt(async () => {
    const siblings = (await deps.units.list(input.subjectId)).filter((u) => u.parentId === input.parentId);
    // 옛 동작: 번호가 있으면 번호, 없으면 형제 중 가장 큰 sort + 1
    const sort = nextSort(siblings, input.no);
    return deps.units.insert({ subjectId: input.subjectId, parentId: input.parentId, title, no: input.no, sort });
  });
}

/** "파트1~파트30 한 번에 만들기". 이미 있는 번호는 건너뛴다. 만든(요청한) 개수를 돌려준다 */
export async function bulkCreateUnits(deps: CatalogDeps, input: { subjectId: string; parentId: string | null; prefix: string; from: number; to: number; suffix?: string }): Promise<Result<number>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const rows = bulkUnitRows(input);
  if (!rows) return err("번호 범위가 올바르지 않습니다 (최대 500개).");
  const r = await attempt(() => deps.units.insertMany(rows));
  return r.ok ? ok(rows.length) : r;
}

export async function renameUnit(deps: CatalogDeps, unitId: string, title: string): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  return attempt(() => deps.units.update(unitId, { title: title.trim() }));
}

export async function moveUnit(deps: CatalogDeps, unitId: string, direction: "up" | "down"): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const unit = await deps.units.byId(unitId);
  if (!unit) return err("단원을 찾을 수 없습니다.");
  return attempt(async () => {
    const siblings = sortSiblings((await deps.units.list(unit.subjectId)).filter((u) => u.parentId === unit.parentId));
    const updates = moveSibling(siblings, unitId, direction);
    if (!updates) return;
    for (const u of updates) await deps.units.update(u.id, { sort: u.sort });
  });
}

/** C4. 단원을 지우면 그 단원 문항은 unit_id null 로 남는다 (FK on delete set null) */
export async function deleteUnit(deps: CatalogDeps, unitId: string): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  return attempt(() => deps.units.delete(unitId));
}

export async function setUnitPriority(deps: CatalogDeps, unitId: string, priority: 1 | 2 | 3 | 4 | 5 | null): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  if (priority !== null && (!Number.isInteger(priority) || priority < 1 || priority > 5)) return err("순위는 1~5 또는 비움이어야 합니다.");
  return attempt(() => deps.units.update(unitId, { priority }));
}
