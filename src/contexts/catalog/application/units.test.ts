import { describe, expect, it } from "vitest";
import { admin, fakeDeps, unit, user } from "./fakes.test-util";
import { bulkCreateUnits, createUnit, deleteUnit, expandUnitIds, moveUnit, questionCountsByUnit, setUnitPriority, unitTree } from "./units";
import { questionIds } from "./questions";

const seedUnits = [unit("top", "s", null, 1, "교직"), unit("a", "s", "top", 1, "1강"), unit("b", "s", "top", 2, "2강"), unit("c", "s", "top", 3, "3강")];

describe("units use cases", () => {
  it("관리자가 아니면 거부, 비로그인은 로그인 요구", async () => {
    expect(await createUnit(fakeDeps(user).deps, { subjectId: "s", parentId: null, title: "x", no: null })).toEqual({ ok: false, error: "관리자만 할 수 있습니다." });
    expect(await deleteUnit(fakeDeps(null).deps, "a")).toEqual({ ok: false, error: "로그인이 필요합니다." });
  });
  it("createUnit: 번호가 있으면 sort = 번호, 없으면 형제 max+1, 빈 이름은 거부", async () => {
    const f = fakeDeps(admin, { units: seedUnits });
    const r = await createUnit(f.deps, { subjectId: "s", parentId: "top", title: " 4강 ", no: null });
    expect(r.ok && r.data).toMatchObject({ title: "4강", sort: 4 });
    const r2 = await createUnit(f.deps, { subjectId: "s", parentId: null, title: "부록", no: 9 });
    expect(r2.ok && r2.data.sort).toBe(9);
    expect((await createUnit(f.deps, { subjectId: "s", parentId: null, title: "  ", no: null })).ok).toBe(false);
  });
  it("C3 createUnit: 같은 부모 아래 같은 번호는 DB unique 로 실패해 err", async () => {
    const f = fakeDeps(admin, { units: seedUnits });
    const r = await createUnit(f.deps, { subjectId: "s", parentId: "top", title: "중복", no: 2 });
    expect(r.ok).toBe(false);
  });
  it("bulkCreateUnits: 이미 있는 번호는 건너뛰고 요청 개수를 돌려준다, 범위 오류는 err", async () => {
    const f = fakeDeps(admin, { units: seedUnits });
    const r = await bulkCreateUnits(f.deps, { subjectId: "s", parentId: "top", prefix: "", from: 1, to: 5, suffix: "강" });
    expect(r).toEqual({ ok: true, data: 5 });
    expect(f.units.filter((u) => u.parentId === "top")).toHaveLength(5);
    expect((await bulkCreateUnits(f.deps, { subjectId: "s", parentId: null, prefix: "p", from: 3, to: 1 })).ok).toBe(false);
  });
  it("moveUnit: 형제 안에서 한 칸 이동, 끝에서는 그대로 성공", async () => {
    const f = fakeDeps(admin, { units: seedUnits });
    expect(await moveUnit(f.deps, "c", "up")).toEqual({ ok: true, data: undefined });
    const tree = await unitTree(f.deps, "s");
    expect(tree[0].children.map((u) => u.id)).toEqual(["a", "c", "b"]);
    expect((await moveUnit(f.deps, "a", "up")).ok).toBe(true);
    expect((await moveUnit(f.deps, "nope", "up")).ok).toBe(false);
  });
  it("C4 deleteUnit: 단원 문항은 unit_id null 로 남는다 · 하위 포함 전개 · 문항 수", async () => {
    const f = fakeDeps(admin, { units: seedUnits });
    f.questions.push({ id: "q1", subjectId: "s", unitId: "a", setId: "set", ord: 1, prompt: "p", choices: [], correctChoice: 1, explanation: null, hint: null, topic: null, difficulty: null, trapTypes: [], tags: [], points: null, needsReview: false, unitConfidence: 1, sourceQuote: null, sourcePage: null });
    expect(await expandUnitIds(f.deps, ["top"])).toEqual(["top", "a", "b", "c"]);
    expect(await questionIds(f.deps, { kind: "units", subjectId: "s", unitIds: ["top"] })).toEqual(["q1"]);
    expect(await deleteUnit(f.deps, "a")).toEqual({ ok: true, data: undefined });
    expect(f.questions[0].unitId).toBeNull();
    expect(await questionCountsByUnit(f.deps, "s")).toEqual(new Map([["__none__", 1]]));
  });
  it("setUnitPriority: 1~5 또는 null", async () => {
    const f = fakeDeps(admin, { units: seedUnits });
    expect((await setUnitPriority(f.deps, "a", 2)).ok).toBe(true);
    expect(f.units.find((u) => u.id === "a")?.priority).toBe(2);
    expect((await setUnitPriority(f.deps, "a", 7 as never)).ok).toBe(false);
  });
});
