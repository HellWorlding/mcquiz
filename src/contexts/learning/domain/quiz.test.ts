import { describe, expect, it } from "vitest";
import { clampElapsed, parseQuizParams, pickByOrder } from "./quiz";

describe("parseQuizParams", () => {
  it("단원 범위 + 순서대로 + 개수·offset", () => {
    const r = parseQuizParams({ subject: "s", units: "u1,u2", count: "20", order: "seq", offset: "40" }, 1);
    expect(r.scope).toEqual({ kind: "units", subjectId: "s", unitIds: ["u1", "u2"] });
    expect(r.filter).toBe("all");
    expect(r.order).toEqual({ kind: "seq", offset: 40 });
    expect(r.count).toBe(20);
    expect(r.titleKind).toBe("units");
  });
  it("무작위는 받은 seed 를 쓴다; count=all", () => {
    const r = parseQuizParams({ subject: "s", order: "random", count: "all" }, 4242);
    expect(r.order).toEqual({ kind: "random", seed: 4242 });
    expect(r.count).toBe("all");
    expect(r.scope).toEqual({ kind: "subject", subjectId: "s" });
    expect(r.titleKind).toBe("subject");
  });
  it("mode=wrong/confused → 그 필터, mode=saved → 저장함 전체(weak)", () => {
    expect(parseQuizParams({ subject: "s", mode: "wrong" }, 1)).toMatchObject({ filter: "wrong", titleKind: "wrong", scope: { kind: "subject" } });
    expect(parseQuizParams({ subject: "s", mode: "confused" }, 1)).toMatchObject({ filter: "confused", titleKind: "confused" });
    expect(parseQuizParams({ subject: "s", mode: "saved" }, 1)).toMatchObject({ filter: "weak", titleKind: "saved" });
  });
  it("mode=weakmix → weak + random + count 기본 20", () => {
    const r = parseQuizParams({ subject: "s", mode: "weakmix" }, 9);
    expect(r).toMatchObject({ filter: "weak", weakMix: true, count: 20, order: { kind: "random", seed: 9 }, titleKind: "weakmix" });
    expect(parseQuizParams({ subject: "s", mode: "weakmix", count: "10" }, 9).count).toBe(10);
  });
  it("mode 는 subject 가 없으면 무시된다", () => {
    expect(parseQuizParams({ mode: "wrong", set: "set1" }, 1)).toMatchObject({ filter: "all", scope: { kind: "set", setId: "set1" } });
  });
  it("ids(다시 풀기)·session(이어서) 이 우선한다", () => {
    expect(parseQuizParams({ ids: "a,b", subject: "s" }, 1)).toMatchObject({ scope: { kind: "ids", ids: ["a", "b"] }, titleKind: "retry" });
    expect(parseQuizParams({ session: "ses", ids: "a" }, 1)).toMatchObject({ sessionId: "ses", scope: null, titleKind: "quiz" });
  });
  it("set / collection", () => {
    expect(parseQuizParams({ set: "x" }, 1).scope).toEqual({ kind: "set", setId: "x" });
    expect(parseQuizParams({ collection: "c" }, 1).scope).toEqual({ kind: "collection", collectionId: "c" });
  });
  it("difficulty·under; 잘못된 값은 null, 잘못된 count 는 20", () => {
    const r = parseQuizParams({ subject: "s", difficulty: "hard", under: "2", count: "abc", offset: "-3" }, 1);
    expect(r.difficulty).toBe("hard");
    expect(r.under).toBe(2);
    expect(r.count).toBe(20);
    expect(r.order).toEqual({ kind: "seq", offset: 0 });
    expect(parseQuizParams({ subject: "s", under: "0" }, 1).under).toBeNull();
    expect(parseQuizParams({ subject: "s", under: "x" }, 1).under).toBeNull();
  });
  it("아무 범위도 없으면 scope null", () => {
    expect(parseQuizParams({}, 1).scope).toBeNull();
  });
});

describe("pickByOrder", () => {
  const ids = ["a", "b", "c", "d", "e"];
  it("순서대로: offset 부터 count 개", () => {
    expect(pickByOrder(ids, { kind: "seq", offset: 1 }, 2)).toEqual(["b", "c"]);
    expect(pickByOrder(ids, { kind: "seq", offset: 0 }, "all")).toEqual(ids);
    expect(pickByOrder(ids, { kind: "seq", offset: 3 }, "all")).toEqual(["d", "e"]);
  });
  it("무작위: seed 로 섞고 앞에서 count 개 (결정적)", () => {
    const a = pickByOrder(ids, { kind: "random", seed: 3 }, 3);
    expect(a).toHaveLength(3);
    expect(a).toEqual(pickByOrder(ids, { kind: "random", seed: 3 }, 3));
    expect([...pickByOrder(ids, { kind: "random", seed: 3 }, "all")].sort()).toEqual(ids);
  });
});

describe("L1 elapsedSec 0..3600", () => {
  it("clampElapsed", () => {
    expect(clampElapsed(null)).toBeNull();
    expect(clampElapsed(undefined)).toBeNull();
    expect(clampElapsed(-5)).toBe(0);
    expect(clampElapsed(12.6)).toBe(13);
    expect(clampElapsed(99999)).toBe(3600);
  });
});
