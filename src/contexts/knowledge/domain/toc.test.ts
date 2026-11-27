import { describe, expect, it } from "vitest";
import { looksLikeToc, parseToc, resolveUnitByFilename, sortTocFirst, unitNoFromFilename } from "./toc";
import { pageRangeOf, parsePageRange, titleFromFilename, toSourceKind } from "./source";
import { aiModeFor } from "./ai-mode";
import { embedNote, embeddingInput, estimateTokens, toVectorLiteral } from "./embedding";

describe("목차·파일명", () => {
  it("looksLikeToc: 파일명 또는 첫 줄 형식", () => {
    expect(looksLikeToc("목차.txt", "아무 글")).toBe(true);
    expect(looksLikeToc("a.txt", "차시\t수업명\n1\t학교")).toBe(true);
    expect(looksLikeToc("a.txt", "본문")).toBe(false);
  });
  it("parseToc: 탭 구분과 'N강 제목' 둘 다", () => {
    expect(parseToc("차시\t수업명\n1\t학교 경영\n2\t학급 운영\n제3강. 교원 연수")).toEqual([
      { no: 1, title: "학교 경영" },
      { no: 2, title: "학급 운영" },
      { no: 3, title: "교원 연수" },
    ]);
  });
  it("unitNoFromFilename", () => {
    expect(unitNoFromFilename("31강 교원의 연수.txt")).toBe(31);
    expect(unitNoFromFilename("part3.md")).toBe(3);
    expect(unitNoFromFilename("lecture-07.txt")).toBe(7);
    expect(unitNoFromFilename("2024 1강.txt")).toBe(1);
    expect(unitNoFromFilename("notes.txt")).toBeNull();
  });
  it("resolveUnitByFilename: 상위 지정 → 최상위 → 아무 것", () => {
    const units = [
      { id: "a", no: 3, title: "A", parentId: "p1" },
      { id: "b", no: 3, title: "B", parentId: null },
      { id: "c", no: 3, title: "C", parentId: "p2" },
    ];
    expect(resolveUnitByFilename("3강.txt", units, "p2")?.id).toBe("c");
    expect(resolveUnitByFilename("3강.txt", units, null)?.id).toBe("b");
    expect(resolveUnitByFilename("3강.txt", units.filter((u) => u.id === "a"), null)?.id).toBe("a");
    expect(resolveUnitByFilename("x.txt", units, null)).toBeNull();
  });
  it("sortTocFirst 는 목차 파일을 앞으로", () => {
    expect(sortTocFirst(["1강.txt", "목차.txt", "2강.txt"], (x) => x)).toEqual(["목차.txt", "1강.txt", "2강.txt"]);
  });
});

describe("자료 값 규칙", () => {
  it("toSourceKind 는 doc 을 포함하고 모르면 기본값", () => {
    expect(toSourceKind("doc")).toBe("doc");
    expect(toSourceKind("zzz")).toBe("script");
    expect(toSourceKind(null, "book")).toBe("book");
  });
  it("titleFromFilename / pageRangeOf / parsePageRange", () => {
    expect(titleFromFilename("31강 교원.PDF")).toBe("31강 교원");
    expect(pageRangeOf([7, 5, 9])).toBe("5-9");
    expect(pageRangeOf([])).toBeNull();
    expect(parsePageRange("5 - 9")).toEqual({ from: 5, to: 9 });
    expect(parsePageRange(null)).toBeNull();
  });
  it("aiModeFor: 자료가 있으면 grounded", () => {
    expect(aiModeFor(0)).toBe("open");
    expect(aiModeFor(1)).toBe("grounded");
  });
  it("embeddingInput 은 제목 경로를 앞에 붙이고, 벡터 리터럴은 [a,b]", () => {
    expect(embeddingInput("자료", "A > B", "본문")).toBe("자료 > A > B\n\n본문");
    expect(embeddingInput("", null, "본문")).toBe("본문");
    expect(toVectorLiteral([0.1, 0.2])).toBe("[0.1,0.2]");
    expect(estimateTokens("가나다")).toBe(4);
    expect(embedNote({ total: 3, done: 3, skipped: false, failed: null })).toBe(" · 임베딩 3개");
    expect(embedNote({ total: 3, done: 1, skipped: false, failed: null })).toContain("1/3");
    expect(embedNote({ total: 0, done: 0, skipped: true, failed: null })).toBe("");
  });
});
