import { describe, expect, it } from "vitest";
import { deleteSource, registerSource, registerSources } from "./register-source";
import { embedPending } from "./embed";
import { getSource, listSources, readChunks } from "./sources";
import { admin, bytes, makeFakeDeps, member } from "./fakes.test-util";

describe("registerSource", () => {
  it("관리자가 아니면 거부", async () => {
    const { deps } = makeFakeDeps(member);
    expect(await registerSource(deps, { subjectId: "S", filename: "1강.txt", bytes: bytes("x"), kind: "script" })).toEqual({ ok: false, error: "관리자만 할 수 있습니다." });
    expect((await registerSource(makeFakeDeps(null).deps, { subjectId: "S", filename: "1강.txt", bytes: bytes("x"), kind: "script" })).ok).toBe(false);
  });

  it("K1 조각을 ord 연속으로 저장하고 파일명 번호로 단원에 연결, 출처 url 을 떼어낸다", async () => {
    const { deps, st } = makeFakeDeps(admin);
    st.units.push({ id: "u3", no: 3, title: "교원 연수", parentId: null });
    const r = await registerSource(deps, { subjectId: "S", filename: "3강 연수.md", bytes: bytes("출처: https://ex.com/a\n# 제목\n\n본문입니다."), kind: "doc", embedBudgetMs: 0 });
    expect(r.ok && r.data.status).toBe("source");
    if (!r.ok || r.data.status !== "source") return;
    expect(r.data.unitTitle).toBe("교원 연수");
    expect(r.data.message).toContain('단원 "교원 연수" 에 연결');
    const src = await getSource(deps, r.data.sourceId!);
    expect(src).toMatchObject({ title: "3강 연수", kind: "doc", unitId: "u3", url: "https://ex.com/a" });
    expect(src && "content" in src).toBe(false);
    const { chunks, total } = await readChunks(deps, r.data.sourceId!);
    expect(total).toBe(1);
    expect(chunks[0]).toMatchObject({ ord: 1, heading: "제목" });
  });

  it("K6 같은 과목·같은 제목은 교체한다 (옛 자료와 조각이 사라짐)", async () => {
    const { deps, st } = makeFakeDeps(admin);
    const a = await registerSource(deps, { subjectId: "S", filename: "노트.txt", bytes: bytes("첫 내용"), kind: "note", embedBudgetMs: 0 });
    const b = await registerSource(deps, { subjectId: "S", filename: "노트.txt", bytes: bytes("둘째 내용"), kind: "note", embedBudgetMs: 0 });
    expect(a.ok && b.ok).toBe(true);
    const list = await listSources(deps, "S");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b.ok ? b.data.sourceId : "");
    expect([...st.chunks.values()].every((c) => c.sourceId === list[0].id)).toBe(true);
    // 다른 과목의 같은 제목은 그대로
    await registerSource(deps, { subjectId: "T", filename: "노트.txt", bytes: bytes("다른 과목"), kind: "note", embedBudgetMs: 0 });
    expect(await listSources(deps, "T")).toHaveLength(1);
    expect(await listSources(deps, "S")).toHaveLength(1);
  });

  it("K6 교체 중 조각 저장이 실패하면 옛 자료와 조각은 남고 새 자료만 지운다", async () => {
    const { deps, st } = makeFakeDeps(admin);
    const a = await registerSource(deps, { subjectId: "S", filename: "노트.txt", bytes: bytes("첫 내용"), kind: "note", embedBudgetMs: 0 });
    const oldId = a.ok ? a.data.sourceId : "";
    const insertMany = deps.chunks.insertMany;
    deps.chunks.insertMany = async () => {
      throw new Error("조각 저장 실패");
    };
    const b = await registerSource(deps, { subjectId: "S", filename: "노트.txt", bytes: bytes("둘째 내용"), kind: "note", embedBudgetMs: 0 });
    deps.chunks.insertMany = insertMany;
    expect(b).toEqual({ ok: false, error: "조각 저장 실패" });
    const list = await listSources(deps, "S");
    expect(list.map((s) => s.id)).toEqual([oldId]);
    expect([...st.chunks.values()].filter((c) => c.sourceId === oldId)).toHaveLength(1);
  });

  it("목차 파일은 단원만 만들고 자료를 넣지 않는다 (중복 no 는 건너뜀)", async () => {
    const { deps, st } = makeFakeDeps(admin);
    st.units.push({ id: "u1", no: 1, title: "있던 단원", parentId: null });
    const r = await registerSource(deps, { subjectId: "S", filename: "목차.txt", bytes: bytes("차시\t수업명\n1\t학교\n2\t학급"), kind: "script" });
    expect(r).toEqual({ ok: true, data: { filename: "목차.txt", status: "toc", message: "단원 1개 생성, 1개는 이미 있음" } });
    expect(st.units.map((u) => u.no)).toEqual([1, 2]);
    expect(await listSources(deps, "S")).toHaveLength(0);
    const empty = await registerSource(deps, { subjectId: "S", filename: "toc.txt", bytes: bytes("아무 형식도 아님"), kind: "script" });
    expect(empty.ok && empty.data.status).toBe("skipped");
  });

  it("빈 파일은 skipped, 책 PDF 는 추출기의 쪽 범위를 쓴다", async () => {
    const { deps } = makeFakeDeps(admin);
    const e = await registerSource(deps, { subjectId: "S", filename: "빈.txt", bytes: bytes("   "), kind: "script" });
    expect(e.ok && e.data).toMatchObject({ status: "skipped", message: "내용이 비어 있습니다." });
    const p = await registerSource(deps, { subjectId: "S", filename: "책.pdf", bytes: bytes("[p.1]\n가\n[p.2]\n나"), kind: "book", embedBudgetMs: 0 });
    expect(p.ok && p.data.status).toBe("source");
    const src = (await listSources(deps, "S"))[0];
    expect(src.pageRange).toBe("1-3");
    expect(p.ok && p.data.message).toContain("조각 2개 (p.1-2)");
  });

  it("임베딩 제공자가 있으면 등록 직후 조각을 임베딩하고 메시지에 적는다. 없으면 생략", async () => {
    const withEmb = makeFakeDeps(admin, { embeddings: true });
    const r = await registerSource(withEmb.deps, { subjectId: "S", filename: "a.txt", bytes: bytes("본문"), kind: "script" });
    expect(r.ok && r.data.message).toContain("임베딩 1개");
    expect([...withEmb.st.chunks.values()][0]).toMatchObject({ embedding: "[0,0.5]", model: "fake-model" });
    const noEmb = makeFakeDeps(admin);
    const r2 = await registerSource(noEmb.deps, { subjectId: "S", filename: "a.txt", bytes: bytes("본문"), kind: "script" });
    expect(r2.ok && r2.data.message).not.toContain("임베딩");
  });

  it("registerSources 는 목차를 먼저 처리한 뒤 나머지 파일을 그 단원에 연결하고, 파일 하나의 실패는 그 파일만 skipped", async () => {
    const { deps } = makeFakeDeps(admin);
    deps.extractor.extract = async (filename, b) => { if (filename === "bad.txt") throw new Error("깨진 파일"); return { text: new TextDecoder().decode(b), pageRange: null }; };
    const files = [
      { filename: "2강 학급.txt", bytes: bytes("학급 운영 본문") },
      { filename: "목차.txt", bytes: bytes("1\t학교\n2\t학급") },
      { filename: "bad.txt", bytes: bytes("x") },
    ];
    const sorted = [files[1], files[0], files[2]];
    const r = await registerSources(deps, sorted, { subjectId: "S", kind: "script", embedBudgetMs: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((x) => x.status)).toEqual(["toc", "source", "skipped"]);
    expect(r.data[1].unitTitle).toBe("학급");
    expect(r.data[2].message).toBe("깨진 파일");
  });

  it("deleteSource 는 관리자만, 조각도 함께 지운다", async () => {
    const { deps, st } = makeFakeDeps(admin);
    const r = await registerSource(deps, { subjectId: "S", filename: "a.txt", bytes: bytes("본문"), kind: "script", embedBudgetMs: 0 });
    const id = r.ok ? r.data.sourceId! : "";
    expect((await deleteSource({ ...deps, user: member }, id)).ok).toBe(false);
    expect(await deleteSource(deps, id)).toEqual({ ok: true, data: undefined });
    expect(st.sources.size).toBe(0);
    expect(st.chunks.size).toBe(0);
  });
});

describe("K2 embedPending", () => {
  it("제공자가 없으면 skipped", async () => {
    const { deps } = makeFakeDeps(admin);
    expect(await embedPending(deps, { subjectId: "S" })).toEqual({ total: 0, done: 0, skipped: true, failed: null });
  });
  it("모델이 다른 조각만 다시 만들고, force 면 전부, 모델 이름을 기록한다", async () => {
    const { deps, st } = makeFakeDeps(admin, { embeddings: true });
    await deps.chunks.insertMany([
      { sourceId: "s", subjectId: "S", unitId: null, ord: 1, page: null, heading: null, content: "a" },
      { sourceId: "s", subjectId: "S", unitId: null, ord: 2, page: null, heading: null, content: "b" },
    ]);
    const [c1] = [...st.chunks.values()];
    c1.embedding = "[9]";
    c1.model = "old-model";
    expect(await embedPending(deps, { subjectId: "S" })).toEqual({ total: 2, done: 2, skipped: false, failed: null });
    expect([...st.chunks.values()].every((c) => c.model === "fake-model")).toBe(true);
    expect(await embedPending(deps, { subjectId: "S" })).toMatchObject({ total: 0, done: 0 });
    expect(await embedPending(deps, { subjectId: "S" }, { force: true })).toMatchObject({ total: 2, done: 2 });
  });
  it("시간 예산을 넘기면 거기까지 하고 돌아온다, 실패는 failed 로", async () => {
    let t = 0;
    const { deps } = makeFakeDeps(admin, { embeddings: true });
    deps.now = () => new Date(1_000_000 + (t += 30_000));
    const rows = Array.from({ length: 130 }, (_, i) => ({ sourceId: "s", subjectId: "S", unitId: null, ord: i + 1, page: null, heading: null, content: `c${i}` }));
    await deps.chunks.insertMany(rows);
    const p = await embedPending(deps, { sourceId: "s" }, { budgetMs: 40_000 });
    expect(p.total).toBe(130);
    expect(p.done).toBeLessThan(130);
    expect(p.done % 64).toBe(0);
    deps.embeddings!.embed = async () => { throw new Error("quota"); };
    expect((await embedPending(deps, { sourceId: "s" })).failed).toBe("quota");
  });
});
