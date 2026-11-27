import { describe, expect, it } from "vitest";
import { pickWeakMix, weakKeys } from "./weak-mix";

const stat = (id: string, unitId: string, lastCorrect: boolean) => ({ questionId: id, unitId, setId: `set-${unitId}`, tags: [] as string[], attemptCount: 1, lastCorrect });
const un = (id: string, unitId: string) => ({ id, unitId, setId: `set-${unitId}`, tags: [] as string[] });

describe("L5 약점 섞어 풀기 (D-007 옛 동작)", () => {
  it("정답률 70% 미만인 단원이 약한 영역", () => {
    const keys = weakKeys([stat("a", "u1", false), stat("b", "u1", false), stat("c", "u1", true), stat("d", "u2", true), stat("e", "u2", true)]);
    expect(keys.has("u:u1")).toBe(true);
    expect(keys.has("u:u2")).toBe(false);
  });
  it("60% 는 약한 단원의 안 푼 문항, 40% 는 저장함", () => {
    const stats = [stat("a", "u1", false), stat("b", "u1", false), stat("c", "u2", true), stat("d", "u2", true)];
    const unsolved = [...Array.from({ length: 10 }, (_, i) => un(`w${i}`, "u1")), ...Array.from({ length: 10 }, (_, i) => un(`o${i}`, "u2"))];
    const out = pickWeakMix({ stats, unsolved, savedBoxIds: ["a", "b", "p1", "p2", "p3"] }, 10, 7);
    expect(out).toHaveLength(10);
    expect(out.filter((id) => id.startsWith("w"))).toHaveLength(6);
    expect(out.filter((id) => id.startsWith("o"))).toHaveLength(0);
    expect(out.filter((id) => ["a", "b", "p1", "p2", "p3"].includes(id))).toHaveLength(4);
  });
  it("약한 영역이 없으면 아무 안 푼 문항으로, 모자라면 나머지로 채움, seed 로 결정적", () => {
    const out1 = pickWeakMix({ stats: [], unsolved: [un("x1", "u"), un("x2", "u")], savedBoxIds: ["p1"] }, 10, 3);
    expect(out1.sort()).toEqual(["p1", "x1", "x2"]);
    const a = pickWeakMix({ stats: [], unsolved: Array.from({ length: 30 }, (_, i) => un(`x${i}`, "u")), savedBoxIds: [] }, 5, 11);
    const b = pickWeakMix({ stats: [], unsolved: Array.from({ length: 30 }, (_, i) => un(`x${i}`, "u")), savedBoxIds: [] }, 5, 11);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });
});
