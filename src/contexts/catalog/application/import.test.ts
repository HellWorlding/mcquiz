import { describe, expect, it } from "vitest";
import { admin, fakeDeps, unit, user } from "./fakes.test-util";
import { authoringGuide, classifyQuestion, commitImport, importQuestions, previewImport } from "./import";
import { questionIds, questionsByIds, deleteSet } from "./questions";
import { emptyQuestion } from "../domain/import/types";

const subjectA = { id: "s", name: "교직실무", visibility: "public" as const, createdAt: "" };
const units = [unit("u1", "s", null, 1, "학교 경영"), unit("u9", "s", null, 9, "장학")];
const TEXT = `
[1강] 학교 경영
1. 학교 경영 계획으로 옳은 것은?
1) 가
2) 나
3) 다
4) 라
정답: 2

2. 장학의 종류가 아닌 것은? [9강]
1) a
2) b
3) c
4) d
`;

describe("import use cases", () => {
  it("관리자만 반입", async () => {
    expect((await previewImport(fakeDeps(user).deps, { subjectId: "s", text: TEXT })).ok).toBe(false);
    expect((await importQuestions(fakeDeps(user).deps, { questions: [], mode: "check" })).ok).toBe(false);
  });
  it("previewImport: 텍스트 파싱 → 단원 힌트로 배정 → 미리보기", async () => {
    const f = fakeDeps(admin, { subjects: [subjectA], units });
    const r = await previewImport(f.deps, { subjectId: "s", text: TEXT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.questions.map((q) => q.unitId)).toEqual(["u1", "u9"]);
    expect(r.data.format).toBe("text");
    expect(r.data.questions[1].correct).toBeNull();
    expect(r.data.suggestedTitle).toMatch(/^붙여넣기/);
  });
  it("previewImport: 입력이 없거나 문항을 못 찾으면 err, 파일은 extractText 로 읽고 정답지 파일은 병합", async () => {
    const f = fakeDeps(admin, { subjects: [subjectA], units });
    expect((await previewImport(f.deps, { subjectId: "s" })).ok).toBe(false);
    expect((await previewImport(f.deps, { subjectId: "s", text: "아무 문항도 없음" })).ok).toBe(false);
    const enc = (s: string) => new TextEncoder().encode(s);
    const r = await previewImport(f.deps, {
      subjectId: "s",
      files: [
        { name: "교직_3강.txt", bytes: enc("1. 질문?\n1) 가\n2) 나\n3) 다\n4) 라") },
        { name: "정답.txt", bytes: enc("1. 정답: 3번") },
      ],
    });
    expect(r.ok && r.data.questions[0]).toMatchObject({ correct: 3, unitHint: 3 });
    expect(r.ok && r.data.sourceFilename).toBe("교직_3강.txt");
    expect(r.ok && r.data.suggestedTitle).toBe("교직_3강");
  });
  it("previewImport: manual 모드는 모두 지정 단원으로, auto+상위 단원은 후보를 제한", async () => {
    const f = fakeDeps(admin, { subjects: [subjectA], units: [...units, unit("u1a", "s", "u1", null, "소단원", 1)] });
    f.classifyScores.set("s", [{ unitId: "u9", score: 5 }, { unitId: "u1a", score: 1 }]);
    const noHint = "1. 아무 질문?\n1) 가\n2) 나\n3) 다\n4) 라\n정답: 1";
    const m = await previewImport(f.deps, { subjectId: "s", text: noHint, assignMode: "manual", targetUnitId: "u9" });
    expect(m.ok && m.data.questions[0]).toMatchObject({ unitId: "u9", unitConfidence: 1 });
    const a = await previewImport(f.deps, { subjectId: "s", text: noHint, assignMode: "auto", targetUnitId: "u1" });
    expect(a.ok && a.data.questions[0].unitId).toBe("u1a");
  });
  it("previewImport: 파일의 subject/unit_path 는 그 과목으로 보내고 없는 과목·단원을 만든다", async () => {
    const f = fakeDeps(admin, { subjects: [subjectA], units });
    const json = JSON.stringify({ subject: "토익", unit_path: ["콜로케이션", "파트3"], questions: [{ prompt: "make a ___", correct_choice: 1, choices: ["a", "b", "c", "d"] }] });
    const r = await previewImport(f.deps, { subjectId: "s", text: json });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const toeic = f.subjects.find((s) => s.name === "TOEIC(English) - Collocation");
    expect(toeic).toBeDefined();
    expect(r.data.subjectOverrides).toEqual({ "TOEIC(English) - Collocation": 1 });
    const part3 = f.units.find((u) => u.subjectId === toeic!.id && u.title === "Part 3");
    expect(part3).toMatchObject({ no: 3, parentId: null });
    expect(r.data.questions[0]).toMatchObject({ subjectId: toeic!.id, unitId: part3!.id, unitConfidence: 1 });
  });
  it("classifyQuestion: 힌트 → 키워드(LOW_CONFIDENCE 이상) → 없으면 후보 1위 유지", async () => {
    const f = fakeDeps(admin, { units });
    const q = { ...emptyQuestion(1), prompt: "학교 경영 계획", choices: [{ text: "가", explanation: null }] };
    f.classifyScores.set("s", [{ unitId: "u1", score: 4 }, { unitId: "u9", score: 1 }]);
    expect(await classifyQuestion(f.deps, "s", units, q)).toMatchObject({ unitId: "u1", method: "keyword" });
    f.classifyScores.set("s", [{ unitId: "u1", score: 1 }, { unitId: "u9", score: 1 }]);
    expect(await classifyQuestion(f.deps, "s", units, q)).toMatchObject({ unitId: "u1", method: "keyword", confidence: 0.1 });
    expect(await classifyQuestion(f.deps, "s", units, { ...q, unitHint: 9 })).toMatchObject({ unitId: "u9", method: "hint", confidence: 1 });
    expect(await classifyQuestion(f.deps, "s", [], q)).toMatchObject({ unitId: null, method: "none" });
  });
  it("C1·C7 commitImport: 검증 실패는 failed 로, 같은 단원·같은 질문은 덮어쓰고 세트는 유지, C5 세트 삭제", async () => {
    const f = fakeDeps(admin, { subjects: [subjectA], units });
    const p = await previewImport(f.deps, { subjectId: "s", text: TEXT });
    if (!p.ok) throw new Error(p.error);
    const bad = { ...p.data.questions[1], key: "bad", prompt: "" };
    const r1 = await commitImport(f.deps, { subjectId: "s", title: "세트1", sourceFilename: null, questions: [...p.data.questions, bad] });
    expect(r1.ok && r1.data).toMatchObject({ inserted: 2, updated: 0, count: 2, failed: [{ index: 2, reason: "질문이 비어 있음" }] });
    const setId = r1.ok ? r1.data.setId : "";
    expect(await questionIds(f.deps, { kind: "set", setId })).toHaveLength(2);
    // 같은 질문을 다시 넣으면 덮어쓰기 (새 세트 없음), 정답이 바뀐 것이 반영
    const again = p.data.questions.map((q) => ({ ...q, correct: 4 }));
    const r2 = await commitImport(f.deps, { subjectId: "s", title: "세트2", sourceFilename: null, questions: again });
    expect(r2.ok && r2.data).toMatchObject({ inserted: 0, updated: 2, setId });
    expect(f.sets).toHaveLength(1);
    const qs = await questionsByIds(f.deps, await questionIds(f.deps, { kind: "set", setId }));
    expect(qs.map((q) => q.correctChoice)).toEqual([4, 4]);
    // 다른 단원이면 새 문항
    const moved = [{ ...p.data.questions[0], unitId: "u9" }];
    const r3 = await commitImport(f.deps, { subjectId: "s", title: "세트3", sourceFilename: null, questions: moved });
    expect(r3.ok && r3.data).toMatchObject({ inserted: 1, updated: 0 });
    expect(f.questions).toHaveLength(3);
    expect((await commitImport(f.deps, { subjectId: "s", title: " ", sourceFilename: null, questions: moved })).ok).toBe(false);
    expect((await commitImport(f.deps, { subjectId: "s", title: "x", sourceFilename: null, questions: [bad] })).ok).toBe(false);
    // C5
    expect(await deleteSet(f.deps, setId)).toEqual({ ok: true, data: undefined });
    expect(f.questions).toHaveLength(1);
  });
  it("commitImport: 같은 파일의 같은 단원·번호는 질문문이 바뀌어도 덮어쓴다", async () => {
    const f = fakeDeps(admin, { subjects: [subjectA], units });
    const p = await previewImport(f.deps, { subjectId: "s", text: TEXT });
    if (!p.ok) throw new Error(p.error);
    await commitImport(f.deps, { subjectId: "s", title: "t", sourceFilename: "a.txt", questions: p.data.questions });
    const edited = p.data.questions.map((q) => ({ ...q, prompt: q.prompt + " (수정)" }));
    const r = await commitImport(f.deps, { subjectId: "s", title: "t", sourceFilename: "a.txt", questions: edited });
    expect(r.ok && r.data).toMatchObject({ inserted: 0, updated: 2 });
  });
  it("importQuestions(MCP): check 는 바꾸지 않고 문제·중복을 보고, commit 은 단원을 만들고 저장", async () => {
    const f = fakeDeps(admin, { subjects: [subjectA], units });
    const good = { subject: "교직실무", unit_path: ["학교 경영"], prompt: "새 질문?", correct_choice: 1, choices: ["a", "b", "c", "d"] };
    const r = await importQuestions(f.deps, {
      mode: "check",
      questions: [
        good,
        { ...good, subject: "없는 과목" },
        { ...good, unit_path: [] },
        { ...good, unit_path: ["새 단원"] },
        { ...good, correct_choice: 9 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.problems).toHaveLength(5);
    expect(r.data.problems[0]).toContain("과목");
    expect(r.data.problems[1]).toContain("unit_path");
    expect(r.data.problems[2]).toContain("새로 만들어집니다");
    expect(r.data.problems[3]).toContain("정답");
    expect(r.data.problems[4]).toContain("범위");
    expect(f.units).toHaveLength(2);
    expect(f.questions).toHaveLength(0);
    const c = await importQuestions(f.deps, { mode: "commit", questions: [good, { ...good, prompt: "둘째?", unit_path: ["장학", "새 소단원"] }], setTitle: "MCP 세트" });
    expect(c.ok && c.data.results).toEqual([{ subject: "교직실무", inserted: 2, updated: 0 }]);
    expect(f.units.find((u) => u.title === "새 소단원")?.parentId).toBe("u9");
    expect(f.sets[0].title).toBe("MCP 세트");
    // 중복 보고 (같은 과목에 같은 질문문)
    const d = await importQuestions(f.deps, { mode: "check", questions: [good] });
    expect(d.ok && d.data).toMatchObject({ duplicates: ["새 질문?"], duplicates_with_existing: 1 });
    expect(d.ok && d.data.next).toContain("고친 뒤");
  });
  it("authoringGuide: 과목을 주면 단원 경로와 예시를 덧붙인다", async () => {
    const f = fakeDeps(admin, { subjects: [subjectA], units });
    expect(await authoringGuide(f.deps)).toContain("# mcquiz 출제 형식 안내");
    const g = await authoringGuide(f.deps, "s");
    expect(g).toContain('["1강 - 학교 경영"]');
    expect(g).not.toContain("실제 문항 예시");
    await importQuestions(f.deps, { mode: "commit", questions: [{ subject: "교직실무", unit_path: ["학교 경영"], prompt: "q", correct_choice: 1, choices: ["a", "b", "c", "d"] }] });
    expect(await authoringGuide(f.deps, "s")).toContain("실제 문항 예시");
  });
});
