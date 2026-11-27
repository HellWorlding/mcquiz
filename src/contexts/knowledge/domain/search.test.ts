import { describe, expect, it } from "vitest";
import { evidenceQuery, fuseRrf, makeSnippet, mergeScopes, needsWiderSearch, pickChunkOnPage, searchMode, sourceLabel, type SearchHit } from "./search";

describe("K3 searchMode", () => {
  it("임베딩이 있고 질의 벡터도 있으면 hybrid", () => {
    expect(searchMode(true, [0.1, 0.2])).toBe("hybrid");
  });
  it("임베딩이 없으면 keyword, 질의 벡터를 못 만들어도 keyword", () => {
    expect(searchMode(false, [0.1])).toBe("keyword");
    expect(searchMode(true, null)).toBe("keyword");
  });
});

describe("RRF fuseRrf (SQL match_chunks 와 같은 정의)", () => {
  it("두 목록에 모두 있는 조각은 점수를 합산하고 순위를 둘 다 기록한다", () => {
    const r = fuseRrf(["a", "b", "c"], ["b", "d"], 60);
    const b = r.find((x) => x.id === "b")!;
    expect(b.vecRank).toBe(2);
    expect(b.kwRank).toBe(1);
    expect(b.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
    expect(r[0].id).toBe("b");
  });
  it("한쪽에만 있으면 그쪽 점수만, 없는 순위는 null", () => {
    const r = fuseRrf(["a"], ["d"]);
    expect(r.find((x) => x.id === "a")).toEqual({ id: "a", score: 1 / 61, vecRank: 1, kwRank: null });
    expect(r.find((x) => x.id === "d")).toEqual({ id: "d", score: 1 / 61, vecRank: null, kwRank: 1 });
  });
  it("점수가 같으면 vecRank(null 뒤) → kwRank(null 뒤) 순", () => {
    const r = fuseRrf(["a"], ["d"]);
    expect(r.map((x) => x.id)).toEqual(["a", "d"]);
    const r2 = fuseRrf(["a", "b"], ["b", "a"]);
    // a: 1/61+1/62, b: 1/62+1/61 → 같은 점수, vecRank 1 인 a 가 먼저
    expect(r2.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("둘 다 비면 빈 배열", () => {
    expect(fuseRrf([], [])).toEqual([]);
  });
});

describe("sourceLabel / makeSnippet", () => {
  it("책은 쪽수, 스크립트·노트는 강 번호, 모르면 제목", () => {
    expect(sourceLabel("book", 3, 292, "책")).toBe("책 p.292");
    expect(sourceLabel("book", 3, null, "교재")).toBe("책 교재");
    expect(sourceLabel("script", 40, null, "x")).toBe("40강 스크립트");
    expect(sourceLabel("note", null, null, "정리")).toBe("정리 (노트)");
    expect(sourceLabel("doc", null, null, "Tool use")).toBe("Tool use (자료)");
  });
  it("발췌는 토큰 주변을 자르고 앞뒤에 … 을 붙인다", () => {
    const content = `${"앞 ".repeat(200)}핵심어 뒤 ${"뒤 ".repeat(200)}`;
    const s = makeSnippet(content, ["핵심어"], 100);
    expect(s).toContain("핵심어");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(102);
  });
  it("토큰이 없으면 앞부분만", () => {
    expect(makeSnippet("짧은 글", [])).toBe("짧은 글");
    expect(makeSnippet("a".repeat(400), ["zzz"], 100)).toBe("a".repeat(100) + "…");
  });
  it("makeSnippet 은 입력 배열을 바꾸지 않는다", () => {
    const toks = ["짧", "길다길다"];
    makeSnippet("길다길다 짧", toks);
    expect(toks).toEqual(["짧", "길다길다"]);
  });
});

const hit = (id: string, scope: "unit" | "all" = "unit"): SearchHit => ({
  id, sourceId: "s", ord: 1, page: null, heading: null, content: id, sourceTitle: "t", sourceUrl: null, kind: "script", unitId: null, unitNo: null,
  score: 1, vecRank: null, kwRank: null, label: "", snippet: "", scope,
});

describe("범위 병합", () => {
  it("단원 결과가 min(2, limit) 미만이면 전체에서 더 찾는다", () => {
    expect(needsWiderSearch(0, 6)).toBe(true);
    expect(needsWiderSearch(1, 6)).toBe(true);
    expect(needsWiderSearch(2, 6)).toBe(false);
    expect(needsWiderSearch(1, 1)).toBe(false);
  });
  it("중복을 빼고 limit 안에서 합친다", () => {
    const m = mergeScopes([hit("a")], [hit("a", "all"), hit("b", "all"), hit("c", "all")], 2);
    expect(m.map((h) => h.id)).toEqual(["a", "b"]);
    expect(m[1].scope).toBe("all");
  });
});

describe("문항 → 질의, 쪽 안 조각 고르기", () => {
  it("evidenceQuery 는 주제어·문제·정답·근거 인용을 이어 붙인다", () => {
    expect(evidenceQuery({ topic: "연수", prompt: "문제", correctText: "정답", sourceQuote: null })).toBe("연수 문제 정답 ");
  });
  it("pickChunkOnPage 는 단원 일치를 우선하고, 다음은 토큰 수", () => {
    const chunks = [
      { id: "x", unitId: "u2", content: "가 나 다" },
      { id: "y", unitId: "u1", content: "가" },
      { id: "z", unitId: "u2", content: "가 나" },
    ];
    expect(pickChunkOnPage(chunks, "u1", ["가", "나", "다"])?.id).toBe("y");
    expect(pickChunkOnPage(chunks, null, ["가", "나", "다"])?.id).toBe("x");
    expect(pickChunkOnPage([], "u1", [])).toBeNull();
  });
});
