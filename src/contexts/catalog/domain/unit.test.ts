import { describe, expect, it } from "vitest";
import { buildTree, flattenTree } from "./tree";
import { bulkUnitRows, descendantIds, findUnitByNo, moveSibling, nextSort, sortSiblings, unitNoConflict, unitPathOf } from "./unit";
import type { Unit } from "./types";

const u = (id: string, parentId: string | null, no: number | null, sort: number, title = id): Unit => ({ id, subjectId: "s", parentId, no, title, sort, priority: null });
const units: Unit[] = [u("b", null, 2, 2, "학교 경영"), u("a", null, 1, 1, "교직"), u("a2", "a", 2, 2, "Unit 2"), u("a1", "a", 1, 1, "Unit 1"), u("a1x", "a1", null, 1, "x")];

describe("C3 단원 no 중복", () => {
  it("같은 부모 아래 같은 번호가 있으면 그 단원 id", () => {
    expect(unitNoConflict(units, null, 2)).toBe("b");
    expect(unitNoConflict(units, "a", 2)).toBe("a2");
  });
  it("다른 부모·번호 없음·자기 자신은 충돌이 아니다", () => {
    expect(unitNoConflict(units, "a", 3)).toBeNull();
    expect(unitNoConflict(units, null, null)).toBeNull();
    expect(unitNoConflict(units, "a", 2, "a2")).toBeNull();
  });
  it("일괄 생성 행은 번호를 sort 로 쓰고 범위가 틀리면 null", () => {
    const rows = bulkUnitRows({ subjectId: "s", parentId: null, prefix: "파트", from: 1, to: 3, suffix: "" })!;
    expect(rows.map((r) => r.title)).toEqual(["파트1", "파트2", "파트3"]);
    expect(rows[2]).toMatchObject({ no: 3, sort: 3 });
    expect(bulkUnitRows({ subjectId: "s", parentId: null, prefix: "p", from: 5, to: 1 })).toBeNull();
    expect(bulkUnitRows({ subjectId: "s", parentId: null, prefix: "p", from: 1, to: 600 })).toBeNull();
  });
});

describe("트리 정렬", () => {
  it("sort → no → id 순, depth 와 children", () => {
    const tree = buildTree(units);
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["a1", "a2"]);
    expect(tree[0].children[0].children[0]).toMatchObject({ id: "a1x", depth: 2 });
    expect(flattenTree(tree).map((n) => n.id)).toEqual(["a", "a1", "a1x", "a2", "b"]);
  });
  it("sort 가 같으면 no, no 가 null 이면 뒤로 (sortSiblings)", () => {
    const list = [u("x", null, null, 1), u("y", null, 3, 1), u("z", null, 1, 1)];
    expect(sortSiblings(list).map((s) => s.id)).toEqual(["z", "y", "x"]);
  });
  it("nextSort 는 번호가 있으면 번호, 없으면 max+1", () => {
    expect(nextSort([{ sort: 4 }, { sort: 2 }], null)).toBe(5);
    expect(nextSort([{ sort: 4 }], 9)).toBe(9);
    expect(nextSort([], null)).toBe(1);
  });
  it("moveSibling 은 인덱스로 다시 매긴 뒤 두 개를 바꾼다", () => {
    const ordered = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveSibling(ordered, "b", "up")).toEqual([{ id: "a", sort: 2 }, { id: "b", sort: 1 }, { id: "c", sort: 3 }]);
    expect(moveSibling(ordered, "a", "up")).toBeNull();
    expect(moveSibling(ordered, "c", "down")).toBeNull();
    expect(moveSibling(ordered, "zz", "down")).toBeNull();
  });
});

describe("단원 찾기·경로", () => {
  it("findUnitByNo 는 최상위 우선, preferParent 아래 우선", () => {
    expect(findUnitByNo(units, 2)?.id).toBe("b");
    expect(findUnitByNo(units, 2, "a")?.id).toBe("a2");
    expect(findUnitByNo(units, 9)).toBeNull();
  });
  it("descendantIds 는 자기 자신 포함", () => {
    expect(descendantIds(units, "a")).toEqual(["a", "a2", "a1", "a1x"]);
  });
  it("unitPathOf 는 최상위부터 라벨", () => {
    expect(unitPathOf(units, "a1x")).toEqual(["1강 - 교직", "Unit 1", "x"]);
    expect(unitPathOf(units, null)).toEqual([]);
  });
});
