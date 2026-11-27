import { describe, expect, it } from "vitest";
import { createPost, deletePost, listPosts, updatePost } from "./posts";
import { admin, fakeDeps, other, user } from "./fakes.test-util";

describe("posts use cases", () => {
  it("게스트는 전부 거부", async () => {
    const { deps } = fakeDeps(null);
    expect(await listPosts(deps, 1)).toEqual({ ok: false, error: "로그인이 필요합니다." });
    expect((await createPost(deps, { kind: "idea", title: "t", body: "b" })).ok).toBe(false);
    expect((await deletePost(deps, "p1")).ok).toBe(false);
  });
  it("글쓰기: 검증 실패는 저장하지 않음, 성공은 open 상태", async () => {
    const { deps, posts } = fakeDeps(user);
    expect((await createPost(deps, { kind: "idea", title: "", body: "b" })).ok).toBe(false);
    expect(posts).toHaveLength(0);
    expect(await createPost(deps, { kind: "bug", title: " t ", body: "b" })).toEqual({ ok: true, data: undefined });
    expect(posts[0]).toMatchObject({ userId: "u", kind: "bug", title: "t", status: "open" });
  });
  it("하루 10개 제한", async () => {
    const { deps } = fakeDeps(user);
    for (let i = 0; i < 10; i++) expect((await createPost(deps, { kind: "idea", title: `t${i}`, body: "b" })).ok).toBe(true);
    expect(await createPost(deps, { kind: "idea", title: "t", body: "b" })).toEqual({ ok: false, error: "하루에 10개까지 쓸 수 있습니다." });
  });
  it("목록: 최신순, 10개씩, pages 계산", async () => {
    const { deps, posts } = fakeDeps(admin);
    for (let i = 0; i < 12; i++) {
      const at = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
      posts.push({ id: `p${i}`, userId: "a", kind: "idea", title: `t${i}`, body: "b", status: "open", adminReply: null, createdAt: at, updatedAt: at, author: "a" });
    }
    const p1 = await listPosts(deps, 1);
    expect(p1.ok && p1.data.posts.length).toBe(10);
    expect(p1.ok && p1.data.posts[0].title).toBe("t11");
    expect(p1.ok && p1.data).toMatchObject({ total: 12, page: 1, pages: 2 });
    const p2 = await listPosts(deps, 2);
    expect(p2.ok && p2.data.posts.map((p) => p.title)).toEqual(["t1", "t0"]);
    const p0 = await listPosts(deps, 0);
    expect(p0.ok && p0.data.page).toBe(1);
  });
  it("삭제: 작성자 또는 관리자만", async () => {
    const { deps: asUser, posts } = fakeDeps(user);
    await createPost(asUser, { kind: "idea", title: "t", body: "b" });
    const id = posts[0].id;
    const asOther = { ...asUser, user: other };
    expect(await deletePost(asOther, id)).toEqual({ ok: false, error: "작성자 또는 관리자만 지울 수 있습니다." });
    expect(posts).toHaveLength(1);
    expect(await deletePost({ ...asUser, user: admin }, id)).toEqual({ ok: true, data: undefined });
    expect(posts).toHaveLength(0);
    await createPost(asUser, { kind: "idea", title: "t2", body: "b" });
    expect((await deletePost(asUser, posts[0].id)).ok).toBe(true);
    expect((await deletePost(asUser, "nope")).ok).toBe(false);
  });
  it("상태 변경·답글은 관리자만", async () => {
    const { deps: asUser, posts } = fakeDeps(user);
    await createPost(asUser, { kind: "idea", title: "t", body: "b" });
    const id = posts[0].id;
    expect(await updatePost(asUser, id, { status: "done" })).toEqual({ ok: false, error: "관리자만 할 수 있습니다." });
    const asAdmin = { ...asUser, user: admin };
    expect((await updatePost(asAdmin, id, { status: "bogus" })).ok).toBe(false);
    expect(await updatePost(asAdmin, id, { status: "progress" })).toEqual({ ok: true, data: undefined });
    expect(posts[0].status).toBe("progress");
    expect((await updatePost(asAdmin, id, { reply: " 확인했습니다 " })).ok).toBe(true);
    expect(posts[0]).toMatchObject({ status: "progress", adminReply: "확인했습니다" });
    expect((await updatePost(asAdmin, id, { reply: "" })).ok).toBe(true);
    expect(posts[0].adminReply).toBeNull();
    expect(posts[0].updatedAt).toBe("2026-11-29T12:00:00.000Z");
  });
});
