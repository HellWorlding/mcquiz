import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/contexts/access";
import type { CatalogApi, Question, Unit } from "@/contexts/catalog";
import type { LearningApi, QuestionStat } from "@/contexts/learning";
import type { KnowledgeApi, SearchHit } from "@/contexts/knowledge";
import { tools, TOOL_LIST, TOOL_NAMES, type ToolContext } from "./tools";

/**
 * MCP 도구는 규칙 없이 세 컨텍스트 공개 API 를 부르고 JSON 으로 바꾼다.
 * 가짜 Api 객체로 "어떤 메서드를 어떤 인자로 부르는가" 와 "응답 모양" 만 확인한다.
 */

const SUBJECT = "11111111-1111-4111-8111-111111111111";
const UNIT_A = "22222222-2222-4222-8222-222222222222";
const UNIT_A1 = "33333333-3333-4333-8333-333333333333";
const qid = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;

const user: CurrentUser = { id: "u1", email: "u@example.com", displayName: null, isAdmin: false, aiLimit: null };
const admin: CurrentUser = { ...user, isAdmin: true };

const units: Unit[] = [
  { id: UNIT_A, subjectId: SUBJECT, parentId: null, no: null, title: "Learning", sort: 1, priority: null },
  { id: UNIT_A1, subjectId: SUBJECT, parentId: UNIT_A, no: 1, title: "학교 경영", sort: 1, priority: 1 },
];

const question = (n: number, patch: Partial<Question> = {}): Question => ({
  id: qid(n),
  subjectId: SUBJECT,
  unitId: UNIT_A1,
  setId: null,
  ord: n,
  prompt: `문제 ${n}`,
  choices: [1, 2, 3, 4].map((o) => ({ ord: o, text: `선지 ${o}`, explanation: o === 1 ? "정답 해설" : null })),
  correctChoice: 1,
  explanation: "해설",
  hint: null,
  topic: "주제",
  difficulty: "medium",
  trapTypes: ["scope_change"],
  tags: [],
  points: null,
  needsReview: false,
  unitConfidence: null,
  sourceQuote: null,
  sourcePage: null,
  ...patch,
});

const stat = (n: number, patch: Partial<QuestionStat> = {}): QuestionStat => ({
  questionId: qid(n),
  unitId: UNIT_A1,
  setId: null,
  tags: [],
  topic: null,
  difficulty: null,
  trapTypes: [],
  attemptCount: 0,
  wrongCount: 0,
  lastCorrect: null,
  lastGradedAt: null,
  wrongAfter: false,
  confusedAfter: false,
  saved: false,
  lastWeakAt: null,
  ...patch,
});

type Fakes = { catalog?: Partial<CatalogApi>; learning?: Partial<LearningApi>; knowledge?: Partial<KnowledgeApi>; user?: CurrentUser
  access?: Partial<ToolContext["access"]>;
};
function ctx(f: Fakes = {}): ToolContext {
  return {
    user: f.user ?? user,
    access: (f.access ?? {}) as ToolContext["access"],
    catalog: (f.catalog ?? {}) as CatalogApi,
    learning: (f.learning ?? {}) as LearningApi,
    knowledge: (f.knowledge ?? {}) as KnowledgeApi,
    appHost: "example.test",
  };
}
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("도구 목록", () => {
  it("도구 이름 13개 (v1 11개 + create_subject, grant_member)", () => {
    expect(TOOL_NAMES).toEqual(["list_subjects", "list_units", "list_questions", "get_question", "search_questions", "get_learning_summary", "get_authoring_guide", "import_questions", "create_subject", "grant_member", "list_sources", "search_sources", "get_source"]);
    expect(TOOL_LIST.map((t) => t.name)).toEqual(TOOL_NAMES);
    for (const t of TOOL_LIST) expect(t.description).toContain("v2");
  });
});

describe("list_questions", () => {
  const questions = [question(1), question(2), question(3)];
  const stats = [stat(1, { attemptCount: 3, wrongCount: 2, lastCorrect: false, lastGradedAt: "2026-11-01T00:00:00.000Z", wrongAfter: true }), stat(2, { attemptCount: 1, wrongCount: 1, wrongAfter: true, saved: true })];
  function fakes() {
    const savedBoxIds = vi.fn(async () => [qid(1), qid(2), qid(3)]);
    const questionsByIds = vi.fn(async (ids: string[]) => ids.map((id) => questions.find((q) => q.id === id)!));
    const notesFor = vi.fn(async (ids: string[]) => new Map(ids.filter((id) => id === qid(1)).map((id) => [id, "메모 1"])));
    const c = ctx({
      catalog: { getSubject: async () => ({ id: SUBJECT, name: "과목", visibility: "public", createdAt: "" }), listUnits: async () => units, questionsByIds },
      learning: { savedBoxIds, questionStats: async () => stats, notesFor },
    });
    return { c, savedBoxIds, questionsByIds, notesFor };
  }

  it("입력 기본값: filter all, limit 50, offset 0, format json", () => {
    expect(tools.list_questions.inputSchema.parse({ subject_id: SUBJECT })).toEqual({ subject_id: SUBJECT, filter: "all", limit: 50, offset: 0, format: "json" });
    expect(() => tools.list_questions.inputSchema.parse({ subject_id: SUBJECT, filter: "unknown" })).toThrow();
  });

  it("filter·unit_id 를 learning.savedBoxIds 에 넘기고, 쪽(offset/limit)은 id 목록에서 자른 뒤 본문을 받는다", async () => {
    const { c, savedBoxIds, questionsByIds, notesFor } = fakes();
    const r = await tools.list_questions.run(c, { subject_id: SUBJECT, unit_id: UNIT_A, filter: "wrong", limit: 2, offset: 1, format: "json" });
    expect(savedBoxIds).toHaveBeenCalledWith(SUBJECT, "wrong", { unitId: UNIT_A });
    expect(questionsByIds).toHaveBeenCalledWith([qid(2), qid(3)]);
    expect(notesFor).toHaveBeenCalledWith([qid(2), qid(3)]);
    const out = parse(r);
    expect(out).toMatchObject({ total: 3, offset: 1, returned: 2 });
    expect(out.questions).toHaveLength(2);
    // 쪽 안에서는 많이 틀린 순 (q2 가 q3 보다 먼저)
    expect(out.questions.map((q: { no: number }) => q.no)).toEqual([2, 3]);
  });

  it("문항은 저장함 내보내기 v2 모양 (unit_path 배열, my_record), 메모가 붙는다", async () => {
    const { c } = fakes();
    const out = parse(await tools.list_questions.run(c, { subject_id: SUBJECT, filter: "all", limit: 50, offset: 0, format: "json" }));
    const first = out.questions[0];
    expect(first).toMatchObject({
      subject: "과목",
      unit_path: ["Learning", "1강 - 학교 경영"],
      no: 1,
      prompt: "문제 1",
      correct_choice: 1,
      trap_types: ["scope_change"],
      choices: [{ ord: 1, text: "선지 1", explanation: "정답 해설" }, { ord: 2, text: "선지 2", explanation: null }, { ord: 3, text: "선지 3", explanation: null }, { ord: 4, text: "선지 4", explanation: null }],
      my_record: { attempts: 3, wrong_count: 2, confused_count: 0, last_result: "wrong", last_solved_at: "2026-11-01T00:00:00.000Z", wrong_picks: [], avg_seconds: null, saved_by_me: false, note: "메모 1" },
    });
    expect(first).not.toHaveProperty("id");
    expect(out.questions[1].my_record.saved_by_me).toBe(true);
    // 기록이 없는 문항도 빈 my_record 로 나온다
    expect(out.questions[2].my_record).toMatchObject({ attempts: 0, wrong_count: 0, last_result: null, note: null });
  });

  it("markdown 형식은 머리말 + 내보내기 Markdown, 과목이 없으면 isError", async () => {
    const { c } = fakes();
    const r = await tools.list_questions.run(c, { subject_id: SUBJECT, filter: "wrong", limit: 50, offset: 0, format: "markdown" });
    expect(r.content[0].text.startsWith("total=3 offset=0 returned=3\n\n# 저장함 내보내기: 과목")).toBe(true);
    expect(r.content[0].text).toContain("조건: wrong.");
    const none = ctx({ catalog: { getSubject: async () => null, listUnits: async () => [] }, learning: { savedBoxIds: async () => [], questionStats: async () => [] } });
    const e = await tools.list_questions.run(none, { subject_id: SUBJECT, filter: "all", limit: 50, offset: 0, format: "json" });
    expect(e.isError).toBe(true);
  });
});

describe("get_question", () => {
  it("문항 하나 = id + v2 문항 모양, 없으면 isError", async () => {
    const c = ctx({
      catalog: { questionsByIds: async (ids) => (ids[0] === qid(1) ? [question(1)] : []), getSubject: async () => ({ id: SUBJECT, name: "과목", visibility: "public", createdAt: "" }), listUnits: async () => units },
      learning: { questionStats: async () => [stat(1, { attemptCount: 1, wrongCount: 0, lastCorrect: true })], notesFor: async () => new Map([[qid(1), "메모"]]) },
    });
    const out = parse(await tools.get_question.run(c, { question_id: qid(1) }));
    expect(out).toMatchObject({ id: qid(1), subject: "과목", unit_path: ["Learning", "1강 - 학교 경영"], my_record: { attempts: 1, last_result: "correct", note: "메모" } });
    expect((await tools.get_question.run(c, { question_id: qid(9) })).isError).toBe(true);
  });
});

describe("search_sources", () => {
  const hit = (patch: Partial<SearchHit> = {}): SearchHit => ({
    id: "c1",
    sourceId: "s1",
    ord: 3,
    page: 12,
    heading: "1장",
    content: "본문",
    sourceTitle: "교재",
    sourceUrl: "https://origin.example/doc",
    kind: "book",
    unitId: UNIT_A1,
    unitNo: 1,
    score: 0.5,
    vecRank: 1,
    kwRank: null,
    label: "책 p.12",
    snippet: "본문",
    scope: "unit",
    ...patch,
  });

  it("knowledge.searchSources 에 unit_id 를 unitIds 배열로 넘기고, 응답은 mode + results[snake_case + app_link]", async () => {
    const searchSources = vi.fn(async () => [hit()]);
    const c = ctx({ knowledge: { searchSources }, catalog: { listUnits: async () => units } });
    const args = tools.search_sources.inputSchema.parse({ subject_id: SUBJECT, query: "학교 경영", unit_id: UNIT_A1 });
    expect(args.limit).toBe(8);
    const out = parse(await tools.search_sources.run(c, args));
    expect(searchSources).toHaveBeenCalledWith({ subjectId: SUBJECT, query: "학교 경영", unitIds: [UNIT_A1], limit: 8 });
    expect(out.mode).toBe("hybrid");
    expect(out.results).toEqual([
      {
        chunk_id: "c1",
        source_id: "s1",
        source_title: "교재",
        kind: "book",
        url: "https://origin.example/doc",
        unit_path: ["Learning", "1강 - 학교 경영"],
        page: 12,
        heading: "1장",
        label: "책 p.12",
        score: 0.5,
        vec_rank: 1,
        kw_rank: null,
        content: "본문",
        app_link: "https://example.test/sources/s1?chunk=c1",
      },
    ]);
  });

  it("순위 정보가 없으면 keyword 모드, unit_id 없으면 unitIds null", async () => {
    const searchSources = vi.fn(async () => [hit({ vecRank: null, kwRank: null })]);
    const c = ctx({ knowledge: { searchSources }, catalog: { listUnits: async () => units } });
    const out = parse(await tools.search_sources.run(c, { subject_id: SUBJECT, query: "학교", limit: 3 }));
    expect(searchSources).toHaveBeenCalledWith({ subjectId: SUBJECT, query: "학교", unitIds: null, limit: 3 });
    expect(out.mode).toBe("keyword");
  });
});

describe("import_questions", () => {
  const report = { mode: "check" as const, received: 1, valid: 1, failed: 0, duplicates_with_existing: 0, problems: [], duplicates: [] };
  const q = { subject: "과목", unit_path: ["Learning", "1강 - 학교 경영"], prompt: "문제", correct_choice: 1, choices: ["a", "b", "c", "d"] };

  it("관리자가 아니면 거부하고 catalog 를 부르지 않는다", async () => {
    const importQuestions = vi.fn();
    const r = await tools.import_questions.run(ctx({ catalog: { importQuestions } }), { questions: [q], mode: "check" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("관리자");
    expect(importQuestions).not.toHaveBeenCalled();
  });

  it("check: 기본 mode, 배열(v1)을 그대로 catalog.importQuestions 에 넘긴다", async () => {
    const importQuestions = vi.fn(async () => ({ ok: true as const, data: { ...report, next: "문제 없음" } }));
    const args = tools.import_questions.inputSchema.parse({ questions: [q] });
    expect(args.mode).toBe("check");
    const out = parse(await tools.import_questions.run(ctx({ user: admin, catalog: { importQuestions } }), args));
    expect(importQuestions).toHaveBeenCalledWith({ questions: [q], mode: "check", setTitle: undefined });
    expect(out).toMatchObject({ mode: "check", valid: 1, next: "문제 없음" });
  });

  it("commit: v2 봉투 { format, version, questions } 는 벗겨서 넘기고 set_title 을 setTitle 로", async () => {
    const importQuestions = vi.fn(async () => ({ ok: true as const, data: { ...report, mode: "commit" as const, results: [{ subject: "과목", inserted: 1, updated: 0 }] } }));
    const args = tools.import_questions.inputSchema.parse({ questions: { format: "mcquiz-questions", version: 2, questions: [q] }, mode: "commit", set_title: "세트 A" });
    const out = parse(await tools.import_questions.run(ctx({ user: admin, catalog: { importQuestions } }), args));
    expect(importQuestions).toHaveBeenCalledWith({ questions: [q], mode: "commit", setTitle: "세트 A" });
    expect(out.results).toEqual([{ subject: "과목", inserted: 1, updated: 0 }]);
  });

  it("catalog 가 err 를 돌려주면 isError 로 전달", async () => {
    const importQuestions = vi.fn(async () => ({ ok: false as const, error: "넣을 수 있는 문항이 없습니다." }));
    const r = await tools.import_questions.run(ctx({ user: admin, catalog: { importQuestions } }), { questions: [q], mode: "commit" });
    expect(r).toEqual({ content: [{ type: "text", text: "넣을 수 있는 문항이 없습니다." }], isError: true });
  });

  it("잘못된 format 값·빈 배열은 입력 단계에서 거부", () => {
    expect(() => tools.import_questions.inputSchema.parse({ questions: { format: "other", questions: [q] } })).toThrow();
    expect(() => tools.import_questions.inputSchema.parse({ questions: [] })).toThrow();
  });
});

describe("list_subjects / get_source", () => {
  it("list_subjects: 과목마다 questionCountsByUnit 합계를 question_count 로, 이름순", async () => {
    const counts = new Map<string, Map<string, number>>([
      ["s1", new Map([[UNIT_A1, 3], ["__none__", 2]])],
      ["s2", new Map()],
    ]);
    const c = ctx({
      catalog: {
        listSubjects: async () => [
          { id: "s2", name: "나", visibility: "restricted", createdAt: "" },
          { id: "s1", name: "가", visibility: "public", createdAt: "" },
        ],
        questionCountsByUnit: async (id) => counts.get(id)!,
      },
    });
    expect(parse(await tools.list_subjects.run(c, {}))).toEqual([
      { id: "s1", name: "가", visibility: "public", question_count: 5 },
      { id: "s2", name: "나", visibility: "restricted", question_count: 0 },
    ]);
  });

  it("get_source: knowledge.getSource + readChunks(from_ord, count) → source/from_ord/next_ord/chunks", async () => {
    const readChunks = vi.fn(async () => ({ chunks: [{ id: "c21", sourceId: "s1", ord: 21, page: null, heading: "2장", content: "내용" }], total: 50, nextOrd: 22 }));
    const c = ctx({
      knowledge: { getSource: async () => ({ id: "s1", subjectId: SUBJECT, unitId: UNIT_A1, kind: "script", title: "스크립트", url: null, pageRange: null, createdAt: "" }), readChunks },
      catalog: { listUnits: async () => units },
    });
    const out = parse(await tools.get_source.run(c, { source_id: "s1", from_ord: 21, count: 1 }));
    expect(readChunks).toHaveBeenCalledWith("s1", 21, 1);
    expect(out).toEqual({
      source: { id: "s1", title: "스크립트", kind: "script", url: null, unit_path: ["Learning", "1강 - 학교 경영"], page_range: null, total_chunks: 50 },
      from_ord: 21,
      next_ord: 22,
      chunks: [{ ord: 21, page: null, heading: "2장", content: "내용" }],
    });
  });

  describe("create_subject / grant_member (D-019)", () => {
    const subj = (name: string, minutesAgo: number) => ({ id: `s-${name}`, name, visibility: "restricted" as const, createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString() });
    it("비관리자는 거부", async () => {
      const c = ctx({ user: { ...user, isAdmin: false } });
      expect((await tools.create_subject.run(c, { name: "새 과목", visibility: "restricted" })).isError).toBe(true);
      expect((await tools.grant_member.run(c, { subject_id: SUBJECT, email: "a@x.com" })).isError).toBe(true);
    });
    it("같은 이름이면 만들지 않고 돌려주고, 1시간 5개를 넘기면 거부, 아니면 만든다", async () => {
      const created: string[] = [];
      const base = {
        createSubject: async (name: string, visibility: "public" | "restricted") => { created.push(name); return { ok: true as const, data: { id: "new", name, visibility, createdAt: new Date().toISOString() } }; },
      };
      const c1 = ctx({ user: { ...user, isAdmin: true }, catalog: { ...base, listSubjects: async () => [subj("기존", 500)] } });
      const dup = JSON.parse((await tools.create_subject.run(c1, { name: "기존", visibility: "restricted" })).content[0].text);
      expect(dup.created).toBe(false);
      const c2 = ctx({ user: { ...user, isAdmin: true }, catalog: { ...base, listSubjects: async () => [1, 2, 3, 4, 5].map((i) => subj(`s${i}`, 10)) } });
      expect((await tools.create_subject.run(c2, { name: "여섯째", visibility: "restricted" })).isError).toBe(true);
      const c3 = ctx({ user: { ...user, isAdmin: true }, catalog: { ...base, listSubjects: async () => [subj("s1", 10), subj("s2", 90)] } });
      const made = JSON.parse((await tools.create_subject.run(c3, { name: "새 과목", visibility: "restricted" })).content[0].text);
      expect(made.created).toBe(true);
      expect(created).toEqual(["새 과목"]);
    });
    it("grant_member 는 access 공개 API 를 호출", async () => {
      const calls: string[] = [];
      const c = ctx({ user: { ...user, isAdmin: true }, access: { grantMember: async (s, e) => { calls.push(`${s}:${e}`); return { ok: true as const, data: { userId: "u1" } }; } } });
      const r = JSON.parse((await tools.grant_member.run(c, { subject_id: SUBJECT, email: "b@x.com" })).content[0].text);
      expect(r.user_id).toBe("u1");
      expect(calls).toEqual([`${SUBJECT}:b@x.com`]);
    });
  });
});
