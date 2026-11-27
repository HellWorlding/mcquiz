import { describe, expect, it } from "vitest";
import { admin, fakeDeps, user } from "./fakes.test-util";
import { addToCollection, createCollection, listCollections, myCollections, removeFromCollection } from "./collections";
import { questionIds } from "./questions";

describe("collections use cases", () => {
  it("게스트는 묶음을 못 보고(빈 목록) 못 만든다", async () => {
    const f = fakeDeps(null);
    expect(await listCollections(f.deps, "s")).toEqual([]);
    expect(await createCollection(f.deps, { subjectId: "s", parentId: null, title: "t", scope: "private" })).toEqual({ ok: false, error: "로그인이 필요합니다." });
    expect((await myCollections(f.deps, "s")).ok).toBe(false);
  });
  it("C6 일반 사용자의 shared 요청은 private 으로, 관리자는 shared", async () => {
    const f = fakeDeps(user);
    const r = await createCollection(f.deps, { subjectId: "s", parentId: null, title: " 내 묶음 ", scope: "shared" });
    expect(r.ok && r.data).toMatchObject({ scope: "private", createdBy: "user", title: "내 묶음" });
    const g = fakeDeps(admin);
    const r2 = await createCollection(g.deps, { subjectId: "s", parentId: null, title: "공용", scope: "shared" });
    expect(r2.ok && r2.data.scope).toBe("shared");
    expect((await createCollection(g.deps, { subjectId: "s", parentId: null, title: " ", scope: "shared" })).ok).toBe(false);
  });
  it("문항 추가는 중복을 건너뛰고, 범위 해석은 하위 묶음을 포함하며 중복을 제거한다", async () => {
    const f = fakeDeps(user);
    const root = await createCollection(f.deps, { subjectId: "s", parentId: null, title: "root", scope: "private" });
    const child = await createCollection(f.deps, { subjectId: "s", parentId: root.ok ? root.data.id : "", title: "child", scope: "private" });
    if (!root.ok || !child.ok) throw new Error();
    expect(await addToCollection(f.deps, root.data.id, ["q1", "q2"])).toEqual({ ok: true, data: 2 });
    expect(await addToCollection(f.deps, root.data.id, ["q2"])).toEqual({ ok: true, data: 1 });
    expect(await addToCollection(f.deps, root.data.id, [])).toEqual({ ok: true, data: 0 });
    await addToCollection(f.deps, child.data.id, ["q2", "q3"]);
    expect(f.items).toHaveLength(4);
    expect(await questionIds(f.deps, { kind: "collection", collectionId: root.data.id })).toEqual(["q1", "q2", "q3"]);
    await removeFromCollection(f.deps, root.data.id, "q1");
    expect(await questionIds(f.deps, { kind: "collection", collectionId: root.data.id })).toEqual(["q2", "q3"]);
  });
});
