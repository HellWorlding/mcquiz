import { describe, expect, it } from "vitest";
import { canDeletePost, validatePost, validatePostPatch } from "./post";

describe("Post 불변식 (03 §5)", () => {
  it("제목 1~80자", () => {
    expect(validatePost({ kind: "idea", title: "", body: "b" }).ok).toBe(false);
    expect(validatePost({ kind: "idea", title: "   ", body: "b" }).ok).toBe(false);
    expect(validatePost({ kind: "idea", title: "a".repeat(81), body: "b" }).ok).toBe(false);
    expect(validatePost({ kind: "idea", title: "a".repeat(80), body: "b" }).ok).toBe(true);
  });
  it("본문 1~500자", () => {
    expect(validatePost({ kind: "idea", title: "t", body: "" }).ok).toBe(false);
    expect(validatePost({ kind: "idea", title: "t", body: "b".repeat(501) }).ok).toBe(false);
    expect(validatePost({ kind: "idea", title: "t", body: "b".repeat(500) }).ok).toBe(true);
  });
  it("앞뒤 공백은 잘라서 저장", () => {
    expect(validatePost({ kind: "bug", title: "  t ", body: " b\n" })).toEqual({ ok: true, data: { kind: "bug", title: "t", body: "b" } });
  });
  it("kind 열거: 모르는 값은 other", () => {
    expect(validatePost({ kind: "praise", title: "t", body: "b" })).toMatchObject({ ok: true, data: { kind: "praise" } });
    expect(validatePost({ kind: "hack", title: "t", body: "b" })).toMatchObject({ ok: true, data: { kind: "other" } });
  });
  it("status 열거: 모르는 값은 거부, reply 는 공백이면 null", () => {
    expect(validatePostPatch({ status: "progress" })).toEqual({ ok: true, data: { status: "progress" } });
    expect(validatePostPatch({ status: "closed" }).ok).toBe(false);
    expect(validatePostPatch({ reply: "  " })).toEqual({ ok: true, data: { adminReply: null } });
    expect(validatePostPatch({ reply: " 고쳤습니다 " })).toEqual({ ok: true, data: { adminReply: "고쳤습니다" } });
    expect(validatePostPatch({ status: "done", reply: null })).toEqual({ ok: true, data: { status: "done", adminReply: null } });
    expect(validatePostPatch({}).ok).toBe(false);
  });
  it("삭제는 작성자 또는 관리자만", () => {
    expect(canDeletePost({ userId: "u" }, { id: "u", isAdmin: false })).toBe(true);
    expect(canDeletePost({ userId: "u" }, { id: "x", isAdmin: false })).toBe(false);
    expect(canDeletePost({ userId: "u" }, { id: "x", isAdmin: true })).toBe(true);
  });
});
