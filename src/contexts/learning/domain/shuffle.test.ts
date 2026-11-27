import { describe, expect, it } from "vitest";
import { hashString, mulberry32, shuffled } from "./shuffle";

describe("L 순서 셔플 결정성", () => {
  const items = Array.from({ length: 20 }, (_, i) => `q${i}`);
  it("같은 seed 면 같은 순서", () => {
    expect(shuffled(items, 1234)).toEqual(shuffled(items, 1234));
    expect(shuffled(items, 7)).toEqual(shuffled(items, 7));
  });
  it("다른 seed 면 다른 순서 (같은 원소 집합)", () => {
    const a = shuffled(items, 1);
    const b = shuffled(items, 2);
    expect(a).not.toEqual(b);
    expect([...a].sort()).toEqual([...items].sort());
    expect([...b].sort()).toEqual([...items].sort());
  });
  it("원본은 바꾸지 않는다", () => {
    const copy = [...items];
    shuffled(items, 99);
    expect(items).toEqual(copy);
  });
  it("선지 객체는 해설과 함께 움직인다 (번호로 잇지 않음)", () => {
    const choices = [
      { ord: 1, text: "a", explanation: "ea" },
      { ord: 2, text: "b", explanation: "eb" },
      { ord: 3, text: "c", explanation: "ec" },
      { ord: 4, text: "d", explanation: "ed" },
    ];
    for (const c of shuffled(choices, 42)) expect(c.explanation).toBe(`e${c.text}`);
  });
  it("mulberry32 는 [0,1) 범위의 결정적 수열", () => {
    const r1 = mulberry32(5);
    const r2 = mulberry32(5);
    for (let i = 0; i < 10; i++) {
      const v = r1();
      expect(v).toBe(r2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("hashString 은 안정적이고 32비트 양수", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    expect(hashString("")).toBeGreaterThanOrEqual(0);
  });
});
