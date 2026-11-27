import { unitLabel } from "@/shared/labels";
import type { Unit } from "./types";

/** C3. 같은 부모 아래 같은 no 가 이미 있으면 그 단원을 돌려준다 (없으면 null) */
export function unitNoConflict(siblings: Pick<Unit, "id" | "parentId" | "no">[], parentId: string | null, no: number | null, exceptId?: string): Unit["id"] | null {
  if (no === null) return null;
  const hit = siblings.find((u) => u.parentId === parentId && u.no === no && u.id !== exceptId);
  return hit?.id ?? null;
}

/** 새 단원의 sort: 번호가 있으면 번호, 없으면 형제 중 가장 큰 sort + 1 */
export function nextSort(siblings: Pick<Unit, "sort">[], no: number | null): number {
  return no ?? siblings.reduce((m, u) => Math.max(m, u.sort), 0) + 1;
}

/**
 * 형제 목록(정렬된 순서)에서 unitId 를 위/아래로 한 칸 옮긴 뒤의 sort 값 목록.
 * 정렬값을 인덱스(1부터)로 다시 매기고 두 개를 교환한다. 움직일 수 없으면 null.
 */
export function moveSibling(ordered: Pick<Unit, "id">[], unitId: string, direction: "up" | "down"): { id: string; sort: number }[] | null {
  const idx = ordered.findIndex((u) => u.id === unitId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return null;
  const updates = ordered.map((u, i) => ({ id: u.id, sort: i + 1 }));
  [updates[idx].sort, updates[swapIdx].sort] = [updates[swapIdx].sort, updates[idx].sort];
  return updates;
}

/** 형제 정렬 규칙 (sort → no, no 가 null 이면 뒤) */
export function sortSiblings<T extends Pick<Unit, "sort" | "no">>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sort - b.sort || (a.no ?? Number.MAX_SAFE_INTEGER) - (b.no ?? Number.MAX_SAFE_INTEGER));
}

/** "파트1~파트30 한 번에 만들기" 의 행. 범위가 틀리면 null */
export function bulkUnitRows(input: { subjectId: string; parentId: string | null; prefix: string; from: number; to: number; suffix?: string }) {
  const { from, to } = input;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > 500) return null;
  const rows = [];
  for (let n = from; n <= to; n++) {
    rows.push({ subjectId: input.subjectId, parentId: input.parentId, title: `${input.prefix}${n}${input.suffix ?? ""}`.trim(), no: n, sort: n });
  }
  return rows;
}

/** 단원 번호 힌트로 단원을 찾는다. 상위 단원을 우선하고, 같은 번호가 여럿이면 preferParent 아래를 우선한다. */
export function findUnitByNo(units: Unit[], no: number, preferParent: string | null = null): Unit | null {
  const hits = units.filter((u) => u.no === no);
  if (hits.length === 0) return null;
  if (preferParent) {
    const under = hits.find((u) => u.parentId === preferParent);
    if (under) return under;
  }
  return hits.find((u) => u.parentId === null) ?? hits[0];
}

/** rootId 와 그 아래 모든 단원 id (평면 목록으로 계산) */
export function descendantIds(units: Pick<Unit, "id" | "parentId">[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) {
    for (const u of units) if (u.parentId === out[i]) out.push(u.id);
  }
  return out;
}

/** 단원 경로 라벨 배열 (최상위 → 해당 단원). 모르면 [] */
export function unitPathOf(units: Unit[], unitId: string | null): string[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const path: string[] = [];
  let cur = unitId ? byId.get(unitId) : undefined;
  let guard = 0;
  while (cur && guard++ < 10) {
    path.unshift(unitLabel(cur.no, cur.title));
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** 자식이 없는 단원들 */
export function leafUnits(units: Unit[]): Unit[] {
  return units.filter((u) => !units.some((c) => c.parentId === u.id));
}
