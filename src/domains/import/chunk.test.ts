import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("책은 [p.N] 기준 쪽 단위, 머리말은 첫 쪽에 붙는다", () => {
    const c = chunkText(`# [책] 31강 교원의 연수 (p.235-240)\n\n[p.235]\n첫 쪽 내용\n\n[p.236]\n둘째 쪽 내용\n[p.237]\n`);
    expect(c.map((x) => x.page)).toEqual([235, 236]);
    expect(c[0].content).toContain("31강 교원의 연수");
    expect(c[0].content).toContain("첫 쪽 내용");
    expect(c[1].content).toBe("둘째 쪽 내용");
    expect(c.map((x) => x.ord)).toEqual([1, 2]);
  });

  it("스크립트는 문단 묶음으로 나누고 page 는 null", () => {
    const para = "교원연수는 기관과 개인 중심으로 구분합니다. ".repeat(30); // ~1200자
    const c = chunkText(`${para}\n\n${para}\n\n${para}`);
    expect(c.length).toBeGreaterThan(1);
    expect(c.every((x) => x.page === null)).toBe(true);
    expect(c.every((x) => x.content.length <= 1700)).toBe(true);
    expect(c.map((x) => x.ord)).toEqual(c.map((_, i) => i + 1));
  });

  it("긴 쪽은 같은 page 번호로 더 나눈다", () => {
    const long = "문장입니다. ".repeat(400); // ~2800자
    const c = chunkText(`[p.5]\n${long}`);
    expect(c.length).toBeGreaterThan(1);
    expect(c.every((x) => x.page === 5)).toBe(true);
  });
});
