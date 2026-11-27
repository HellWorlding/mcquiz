import { describe, expect, it } from "vitest";
import { pickWeakMix } from "./weak-mix";

describe("L5 약점 섞어 풀기 표본", () => {
  const box = ["a", "b", "c", "d", "e"];
  it("저장함에서 n개를 뽑는다", () => {
    const out = pickWeakMix(box, 3, 1);
    expect(out).toHaveLength(3);
    for (const id of out) expect(box).toContain(id);
    expect(new Set(out).size).toBe(3);
  });
  it("모자라면 안 푼 문항으로 채우지 않고 있는 만큼만", () => {
    expect(pickWeakMix(["a", "b"], 10, 1).sort()).toEqual(["a", "b"]);
    expect(pickWeakMix([], 10, 1)).toEqual([]);
  });
  it("같은 seed 면 같은 표본, 중복 id 는 한 번만", () => {
    expect(pickWeakMix(box, 4, 77)).toEqual(pickWeakMix(box, 4, 77));
    expect(pickWeakMix(["a", "a", "b"], 5, 1).sort()).toEqual(["a", "b"]);
  });
});
