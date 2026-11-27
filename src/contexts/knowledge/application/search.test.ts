import { describe, expect, it } from "vitest";
import { findEvidence, locateChunk, searchSources } from "./search";
import { filePage, filePageUrl, splitBookFile, uploadWholeFile } from "./files";
import { admin, bytes, makeFakeDeps, member, rawHit } from "./fakes.test-util";

describe("searchSources", () => {
  it("K3 임베딩이 없으면 키워드 검색만 부른다", async () => {
    const { deps, st } = makeFakeDeps(member, { embeddings: true, hasEmbeddings: false });
    st.hitsFor = () => [rawHit("c1")];
    const hits = await searchSources(deps, { subjectId: "S", query: "교원연수 기관" });
    expect(st.keywordCalls).toBe(1);
    expect(st.hybridCalls).toBe(0);
    expect(hits[0]).toMatchObject({ id: "c1", label: "3강 스크립트", scope: "all" });
    expect(hits[0].snippet).toContain("교원연수");
  });
  it("K3 임베딩이 있으면 하이브리드, 제공자가 실패하면 키워드로", async () => {
    const { deps, st } = makeFakeDeps(member, { embeddings: true, hasEmbeddings: true });
    st.hitsFor = () => [rawHit("c1", { vecRank: 2, kwRank: 1 })];
    const hits = await searchSources(deps, { subjectId: "S", query: "교원연수" });
    expect(st.hybridCalls).toBe(1);
    expect(hits[0]).toMatchObject({ vecRank: 2, kwRank: 1 });
    deps.embeddings!.embed = async () => { throw new Error("down"); };
    await searchSources(deps, { subjectId: "S", query: "교원연수" });
    expect(st.keywordCalls).toBe(1);
  });
  it("토큰이 없고 임베딩도 없으면 빈 결과, 검색 함수를 부르지 않는다", async () => {
    const { deps, st } = makeFakeDeps(member);
    expect(await searchSources(deps, { subjectId: "S", query: "은 는 이 가" })).toEqual([]);
    expect(st.keywordCalls + st.hybridCalls).toBe(0);
  });
  it("단원 결과가 모자라면 전체에서 채우고 scope 를 구분한다", async () => {
    const { deps, st } = makeFakeDeps(member);
    st.hitsFor = (unitIds) => (unitIds ? [rawHit("in")] : [rawHit("in"), rawHit("out1"), rawHit("out2")]);
    const hits = await searchSources(deps, { subjectId: "S", query: "교원연수", unitIds: ["u"], limit: 2 });
    expect(hits.map((h) => [h.id, h.scope])).toEqual([["in", "unit"], ["out1", "all"]]);
    st.hitsFor = (unitIds) => (unitIds ? [rawHit("a"), rawHit("b")] : [rawHit("z")]);
    const enough = await searchSources(deps, { subjectId: "S", query: "교원연수", unitIds: ["u"], limit: 6 });
    expect(enough.map((h) => h.id)).toEqual(["a", "b"]);
  });
});

describe("findEvidence", () => {
  it("로그인 필요, 없는 문항은 오류", async () => {
    expect((await findEvidence(makeFakeDeps(null).deps, "q")).ok).toBe(false);
    expect(await findEvidence(makeFakeDeps(member).deps, "q")).toEqual({ ok: false, error: "문항을 찾을 수 없습니다." });
  });
  it("정답 선지·주제어·근거 인용으로 질의하고 단원 라벨을 돌려준다", async () => {
    const { deps, st } = makeFakeDeps(member);
    st.units.push({ id: "u3", no: 3, title: "교원 연수", parentId: null });
    st.questions.set("q", { id: "q", subjectId: "S", unitId: "u3", prompt: "연수의 종류는?", topic: "연수", sourceQuote: null, explanation: null, correctChoice: 2, choices: [{ ord: 1, text: "틀림" }, { ord: 2, text: "직무연수" }] });
    let seen: string[] | null = null;
    st.hitsFor = (unitIds) => { seen = unitIds; return [rawHit("c1", { unitId: "u3" }), rawHit("c2", { unitId: "u3" })]; };
    const r = await findEvidence(deps, "q");
    expect(r.ok && r.data.unitTitle).toBe("3강 - 교원 연수");
    expect(r.ok && r.data.hits.map((h) => h.scope)).toEqual(["unit", "unit"]);
    expect(seen).toEqual(["u3"]);
  });
});

describe("locateChunk / filePage", () => {
  it("쪽수가 있으면 그 쪽의 조각(단원 일치 우선), 없으면 검색", async () => {
    const { deps, st } = makeFakeDeps(member);
    await deps.chunks.insertMany([
      { sourceId: "s1", subjectId: "S", unitId: "u1", ord: 1, page: 7, heading: null, content: "가" },
      { sourceId: "s1", subjectId: "S", unitId: "u2", ord: 2, page: 7, heading: null, content: "가 나 다" },
    ]);
    const byPage = await locateChunk(deps, { subjectId: "S", unitId: "u1", page: 7, text: "가 나 다" });
    expect(byPage?.chunkId).toBe([...st.chunks.values()][0].id);
    st.hitsFor = () => [rawHit("cX", { sourceId: "s9" })];
    expect(await locateChunk(deps, { subjectId: "S", page: 99, text: "교원연수" })).toEqual({ sourceId: "s9", chunkId: "cX", page: null });
    st.hitsFor = () => [];
    expect(await locateChunk(deps, { subjectId: "S", text: "교원연수" })).toBeNull();
  });
  it("단원 파일이 있으면 파일 안 쪽으로, 없으면 통째 파일 + offset, 둘 다 없으면 null", async () => {
    const { deps } = makeFakeDeps(member);
    expect(await filePage(deps, "S", 12)).toBeNull();
    await deps.files.upsert({ subjectId: "S", unitId: null, name: "book", title: "책", storagePath: "S/book.pdf", pageOffset: 4, pageFrom: null, pageTo: null, pages: null });
    expect(await filePage(deps, "S", 12)).toMatchObject({ storagePath: "S/book.pdf", pageInFile: 16 });
    expect(await filePage(deps, "S", null)).toMatchObject({ storagePath: "S/book.pdf", pageInFile: null });
    await deps.files.upsert({ subjectId: "S", unitId: "u", name: "book:003", title: "3강", storagePath: "S/book/003.pdf", pageOffset: 4, pageFrom: 10, pageTo: 20, pages: 11 });
    expect(await filePage(deps, "S", 12)).toMatchObject({ storagePath: "S/book/003.pdf", pageInFile: 3 });
    await deps.storage.upload("S/book/003.pdf", new Uint8Array(1), "application/pdf");
    expect(await filePageUrl(deps, "S", 12)).toBe("https://signed/S/book/003.pdf#page=3");
    expect(await filePageUrl(deps, "S", 30)).toBeNull(); // 통째 파일은 저장소에 없음 → 서명 실패
  });
});

describe("교재 PDF 올리기·분할 (관리자)", () => {
  it("일반 사용자는 거부", async () => {
    const { deps } = makeFakeDeps(member);
    expect((await uploadWholeFile(deps, { subjectId: "S", bytes: bytes("pdf"), title: "책" })).ok).toBe(false);
    expect((await splitBookFile(deps, { subjectId: "S", bytes: bytes("pdf") })).ok).toBe(false);
  });
  it("책 자료의 page_range 대로 잘라 올리고 통째 파일은 지운다, 범위 밖은 건너뜀", async () => {
    const { deps, st } = makeFakeDeps(admin);
    await uploadWholeFile(deps, { subjectId: "S", bytes: bytes("pdf"), title: "책", pageOffset: 2 });
    expect(st.storage.has("S/book.pdf")).toBe(true);
    st.units.push({ id: "u3", no: 3, title: "3강 제목", parentId: null });
    await deps.sources.insert({ subjectId: "S", unitId: "u3", kind: "book", title: "b3", content: "", pageRange: "1-4", url: null });
    await deps.sources.insert({ subjectId: "S", unitId: null, kind: "book", title: "b-late", content: "", pageRange: "5-8", url: null });
    await deps.sources.insert({ subjectId: "S", unitId: null, kind: "book", title: "b-out", content: "", pageRange: "20-25", url: null });
    const r = await splitBookFile(deps, { subjectId: "S", bytes: bytes("pdf"), pageOffset: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.files.map((f) => [f.key, f.from, f.to, f.bytes])).toEqual([["003", 1, 4, 4], [expect.stringMatching(/^s/), 5, 8, 4]]); // 5+2..min(8+2,10) → 7..10 = 4쪽
    expect(r.data.skipped).toHaveLength(1);
    expect(r.data.removedWhole).toBe("S/book.pdf");
    expect(st.storage.has("S/book.pdf")).toBe(false);
    expect(await filePage(deps, "S", 2)).toMatchObject({ storagePath: "S/book/003.pdf", pageInFile: 2 });
  });
  it("책 자료가 없으면 오류", async () => {
    const { deps } = makeFakeDeps(admin);
    expect((await splitBookFile(deps, { subjectId: "S", bytes: bytes("pdf") })).ok).toBe(false);
  });
});
