import { z } from "zod";
import type { Result } from "@/shared/result";
import type { CurrentUser } from "@/contexts/access";
import { unitPathOf, type CatalogApi, type Question, type Unit } from "@/contexts/catalog";
import { buildSavedExport, exportQuestionJson, recordFromStat, LEARNING_FILTERS, type ExportQuestion, type ExportRow, type ExportUnit, type LearningApi, type QuestionStat } from "@/contexts/learning";
import type { KnowledgeApi } from "@/contexts/knowledge";

/**
 * MCP 도구 정의 (Integration). 도구는 규칙을 갖지 않는다 — 각 컨텍스트의 공개 API 를 부르고 결과를 JSON/Markdown 으로 바꾸기만 한다.
 * 응답 JSON 은 저장함 내보내기 v2 와 같은 모양(exportQuestionJson)이다.
 * 인증·DB·시간 제한은 infrastructure(register.ts, mcp-auth.ts)가 맡고, 여기는 ToolContext 만 받는다 (가짜 Api 로 단위 테스트).
 */

export const SERVER_VERSION = "2.0.0";

export const SERVER_INSTRUCTIONS =
  "mcquiz 는 객관식 퀴즈 앱입니다. 먼저 list_subjects 로 과목 id 를 얻고, list_units / list_questions / get_learning_summary 로 문항과 학습 기록을 읽으세요. 자료가 올라온 과목은 list_sources / search_sources(하이브리드 검색) / get_source 로 원자료 조각을 읽고 근거로 삼으세요. 새 과목이 필요하면 create_subject(관리자, 1시간 5개) 로 만들고 제한 과목은 grant_member 로 사용자를 추가하세요. 새 문항을 만들 때는 get_authoring_guide 를 읽고 import_questions(mode=check) 로 검사한 뒤 commit 하세요. 응답 형식은 v2 (저장함 내보내기 mcquiz-saved-export v2 와 같은 문항 모양) 입니다.";

/** 도구가 받는 것: 토큰 사용자와 세 컨텍스트의 공개 API. appHost 는 app_link 를 만들 때 쓴다 */
/** Access 공개 API 중 도구가 쓰는 부분 */
export type AccessTools = { grantMember(subjectId: string, email: string): Promise<Result<{ userId: string }>> };

export type ToolContext = {
  user: CurrentUser;
  access: AccessTools;
  catalog: CatalogApi;
  learning: LearningApi;
  knowledge: KnowledgeApi;
  appHost: string;
};

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export type ToolDef<S extends z.ZodObject<z.ZodRawShape>> = {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  // 메서드 문법: 서로 다른 입력 타입의 도구를 한 배열(AnyToolDef[])에 담기 위해 (양방향 호환)
  run(ctx: ToolContext, args: z.output<S>): Promise<ToolResult>;
};
export type AnyToolDef = ToolDef<z.ZodObject<z.ZodRawShape>>;

const defineTool = <S extends z.ZodObject<z.ZodRawShape>>(def: ToolDef<S>): ToolDef<S> => def;

export const text = (s: string): ToolResult => ({ content: [{ type: "text", text: s }] });
export const json = (v: unknown): ToolResult => text(JSON.stringify(v, null, 2));
export const fail = (msg: string): ToolResult => ({ content: [{ type: "text", text: msg }], isError: true });

const SUBJECT_MISSING = "과목을 찾을 수 없거나 볼 권한이 없습니다.";

// ---- 형 변환 (Catalog camelCase → 내보내기 v2 snake_case) ----

const toExportUnit = (u: Unit): ExportUnit => ({ id: u.id, no: u.no, title: u.title, parent_id: u.parentId });

const toExportQuestion = (q: Question): ExportQuestion => ({
  id: q.id,
  unit_id: q.unitId,
  ord: q.ord,
  prompt: q.prompt,
  correct_choice: q.correctChoice,
  topic: q.topic,
  difficulty: q.difficulty,
  trap_types: q.trapTypes,
  tags: q.tags,
  explanation: q.explanation,
  hint: q.hint,
  source_quote: q.sourceQuote,
  source_page: q.sourcePage,
  choices: q.choices.map((c) => ({ ord: c.ord, text: c.text, explanation: c.explanation })),
});

const statMap = (stats: QuestionStat[]) => new Map(stats.map((s) => [s.questionId, s]));

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

// ---- 도구 ----

const listSubjects = defineTool({
  name: "list_subjects",
  title: "과목 목록",
  description: "내가 볼 수 있는 과목과 문항 수. 다른 도구의 subject_id 는 여기서 얻는다. (응답 형식 v2)",
  inputSchema: z.object({}),
  async run(ctx) {
    const subjects = await ctx.catalog.listSubjects();
    const counts = await Promise.all(subjects.map((s) => ctx.catalog.questionCountsByUnit(s.id)));
    const rows = subjects
      .map((s, i) => ({ id: s.id, name: s.name, visibility: s.visibility, question_count: sum(counts[i]) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return json(rows);
  },
});

const listUnits = defineTool({
  name: "list_units",
  title: "단원 트리",
  description: "과목의 단원 트리. 단원마다 경로(path), 문항 수, 우선순위, 내 회독별 점수(round_scores: k번째 풀이에서 n개 중 correct개). (응답 형식 v2)",
  inputSchema: z.object({ subject_id: z.string().uuid() }),
  async run(ctx, { subject_id }) {
    const [units, counts, scores] = await Promise.all([ctx.catalog.listUnits(subject_id), ctx.catalog.questionCountsByUnit(subject_id), ctx.learning.unitRoundScores(subject_id)]);
    const rounds = new Map<string, { round: number; n: number; correct: number }[]>();
    for (const r of scores) {
      const k = r.unitId ?? "";
      rounds.set(k, [...(rounds.get(k) ?? []), { round: r.roundNo, n: r.n, correct: r.nCorrect }]);
    }
    const rows = units
      .map((u) => ({
        id: u.id,
        parent_id: u.parentId,
        no: u.no,
        title: u.title,
        path: unitPathOf(units, u.id),
        priority: u.priority,
        question_count: counts.get(u.id) ?? 0,
        round_scores: (rounds.get(u.id) ?? []).sort((a, b) => a.round - b.round),
      }))
      .sort((a, b) => a.path.join("/").localeCompare(b.path.join("/"), "ko"));
    return json(rows);
  },
});

const listQuestions = defineTool({
  name: "list_questions",
  title: "문항 목록",
  description:
    "문항 원문(질문·선지·정답·해설·근거)과 내 기록(my_record). filter: all | unsolved(안 푼 것) | wrong(틀림) | repeat(2회 이상 틀림) | confused(헷갈림) | saved(직접 저장) | weak(틀림·헷갈림·저장 중 하나). unit_id 를 주면 그 단원과 하위 단원만. 많이 틀린 순. (응답 형식 v2: 저장함 내보내기와 같은 문항 모양)",
  inputSchema: z.object({
    subject_id: z.string().uuid(),
    unit_id: z.string().uuid().optional(),
    filter: z.enum(LEARNING_FILTERS).default("all"),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
    format: z.enum(["json", "markdown"]).default("json"),
  }),
  async run(ctx, { subject_id, unit_id, filter, limit, offset, format }) {
    const [subject, units, ids, stats] = await Promise.all([
      ctx.catalog.getSubject(subject_id),
      ctx.catalog.listUnits(subject_id),
      ctx.learning.savedBoxIds(subject_id, filter, { unitId: unit_id ?? null }),
      ctx.learning.questionStats(subject_id),
    ]);
    if (!subject) return fail(SUBJECT_MISSING);
    const total = ids.length;
    const page = ids.slice(offset, offset + limit);
    const [questions, notes] = await Promise.all([ctx.catalog.questionsByIds(page), ctx.learning.notesFor(page)]);
    const byId = statMap(stats);
    const rows: ExportRow[] = questions.map((q) => ({ q: toExportQuestion(q), r: recordFromStat(byId.get(q.id), notes.get(q.id) ?? null) }));
    const built = buildSavedExport({ subjectName: subject.name, exportedAt: new Date().toISOString(), filterLabel: filter === "all" ? null : filter, units: units.map(toExportUnit), rows });
    if (format === "markdown") return text(`total=${total} offset=${offset} returned=${rows.length}\n\n${built.markdown}`);
    const j = built.json as { questions: unknown[] };
    return json({ total, offset, returned: rows.length, questions: j.questions });
  },
});

const getQuestion = defineTool({
  name: "get_question",
  title: "문항 하나",
  description: "문항 id 로 원문과 내 기록을 본다. (응답 형식 v2)",
  inputSchema: z.object({ question_id: z.string().uuid() }),
  async run(ctx, { question_id }) {
    const [q] = await ctx.catalog.questionsByIds([question_id]);
    if (!q) return fail("문항을 찾을 수 없거나 볼 권한이 없습니다.");
    const [subject, units, stats, notes] = await Promise.all([ctx.catalog.getSubject(q.subjectId), ctx.catalog.listUnits(q.subjectId), ctx.learning.questionStats(q.subjectId), ctx.learning.notesFor([question_id])]);
    const row: ExportRow = { q: toExportQuestion(q), r: recordFromStat(statMap(stats).get(question_id), notes.get(question_id) ?? null) };
    return json({ id: q.id, ...exportQuestionJson(subject?.name ?? "", units.map(toExportUnit), row) });
  },
});

const searchQuestions = defineTool({
  name: "search_questions",
  title: "문항 검색",
  description: "질문문·해설에서 글자 검색. 새 문항을 내기 전 중복 확인용. (응답 형식 v2)",
  inputSchema: z.object({ subject_id: z.string().uuid(), query: z.string().min(2).max(200), limit: z.number().int().min(1).max(50).default(20) }),
  async run(ctx, { subject_id, query, limit }) {
    const [hits, units] = await Promise.all([ctx.catalog.searchQuestions(subject_id, query, limit), ctx.catalog.listUnits(subject_id)]);
    return json(hits.map((q) => ({ id: q.id, unit_path: unitPathOf(units, q.unitId), no: q.ord, prompt: q.prompt, topic: q.topic })));
  },
});

const getLearningSummary = defineTool({
  name: "get_learning_summary",
  title: "학습 기록 분석 자료",
  description: "출제·분석용 Markdown. 단원별 오답 표와 약한 문항(틀림·헷갈림·저장)을 많이 틀린 순으로 담는다. 앱의 '저장함 내보내기'와 같은 내용. (응답 형식 v2)",
  inputSchema: z.object({ subject_id: z.string().uuid(), unit_id: z.string().uuid().optional(), top: z.number().int().min(1).max(300).default(60) }),
  async run(ctx, { subject_id, unit_id, top }) {
    const r = await ctx.learning.learningSummary(subject_id, unit_id ?? null, top);
    return r.ok ? text(r.data) : fail(r.error);
  },
});

const getAuthoringGuide = defineTool({
  name: "get_authoring_guide",
  title: "출제 형식 안내",
  description: "새 문항을 만들 때 지켜야 할 JSON 형식과 규칙, 그리고 과목의 기존 단원 경로 목록. 출제 전에 한 번 읽는다. (반입 형식 v2)",
  inputSchema: z.object({ subject_id: z.string().uuid().optional() }),
  async run(ctx, { subject_id }) {
    return text(await ctx.catalog.authoringGuide(subject_id));
  },
});

const questionList = z.array(z.record(z.string(), z.unknown())).min(1).max(500);
/** 반입 JSON v2 `{ format: "mcquiz-questions", version: 2, questions: [...] }` 또는 v1 (문항 배열 그대로) */
const importInput = z.union([
  questionList,
  z.object({ format: z.literal("mcquiz-questions").optional(), version: z.number().int().optional(), questions: questionList }),
]);

const importQuestions = defineTool({
  name: "import_questions",
  title: "문항 넣기",
  description:
    "문항 JSON 을 과목에 넣는다 (관리자만). questions 는 문항 배열(v1) 또는 { format: \"mcquiz-questions\", version: 2, questions: [...] } (v2). mode=check 는 형식 검사·중복 확인 결과만 돌려주고 아무것도 바꾸지 않는다. mode=commit 은 실제로 넣는다. 항상 check 를 먼저 하라. 각 문항의 subject 와 unit_path 로 과목·단원이 정해지고, 없는 소단원은 만들어진다.",
  inputSchema: z.object({
    questions: importInput,
    mode: z.enum(["check", "commit"]).default("check"),
    set_title: z.string().max(120).optional(),
  }),
  async run(ctx, { questions, mode, set_title }) {
    if (!ctx.user.isAdmin) return fail("문항 넣기는 관리자 계정만 할 수 있습니다.");
    const list = Array.isArray(questions) ? questions : questions.questions;
    const r = await ctx.catalog.importQuestions({ questions: list, mode, setTitle: set_title });
    return r.ok ? json(r.data) : fail(r.error);
  },
});

// ---- 자료(RAG) ----

const listSources = defineTool({
  name: "list_sources",
  title: "자료 목록",
  description: "과목에 올라온 자료(스크립트·노트·책·문서)와 조각 수, 임베딩 여부. 어떤 원자료가 있는지 먼저 볼 때. (응답 형식 v2)",
  inputSchema: z.object({ subject_id: z.string().uuid(), unit_id: z.string().uuid().optional() }),
  async run(ctx, { subject_id, unit_id }) {
    const [sources, units] = await Promise.all([ctx.knowledge.listSources(subject_id, unit_id ?? null), ctx.catalog.listUnits(subject_id)]);
    return json(
      sources.map((s) => ({
        id: s.id,
        title: s.title,
        kind: s.kind,
        url: s.url,
        unit_path: unitPathOf(units, s.unitId),
        page_range: s.pageRange,
        chunks: s.chunkCount ?? null,
        embedded: s.embeddedCount ?? null,
      })),
    );
  },
});

const searchSources = defineTool({
  name: "search_sources",
  title: "자료 검색 (RAG)",
  description:
    "질문·주제어로 과목 자료에서 관련 조각을 찾는다. 임베딩이 있는 과목은 벡터+키워드 하이브리드, 없으면 키워드. 출제 근거·해설 근거를 찾을 때 먼저 쓴다. 결과의 app_link 는 앱의 원문 보기 주소, url 은 원 출처. (응답 형식 v2)",
  inputSchema: z.object({
    subject_id: z.string().uuid(),
    query: z.string().min(2).max(1000).describe("자연어 질문이나 주제어. 한국어·영어 모두 가능"),
    unit_id: z.string().uuid().optional().describe("이 단원 안에서 먼저 찾고, 모자라면 과목 전체"),
    limit: z.number().int().min(1).max(30).default(8),
  }),
  async run(ctx, { subject_id, query, unit_id, limit }) {
    const [hits, units] = await Promise.all([ctx.knowledge.searchSources({ subjectId: subject_id, query, unitIds: unit_id ? [unit_id] : null, limit }), ctx.catalog.listUnits(subject_id)]);
    return json({
      mode: hits.some((h) => h.vecRank !== null || h.kwRank !== null) ? "hybrid" : "keyword",
      results: hits.map((h) => ({
        chunk_id: h.id,
        source_id: h.sourceId,
        source_title: h.sourceTitle,
        kind: h.kind,
        url: h.sourceUrl,
        unit_path: unitPathOf(units, h.unitId),
        page: h.page,
        heading: h.heading,
        label: h.label,
        score: h.score,
        vec_rank: h.vecRank,
        kw_rank: h.kwRank,
        content: h.content,
        app_link: `https://${ctx.appHost}/sources/${h.sourceId}?chunk=${h.id}`,
      })),
    });
  },
});

const getSource = defineTool({
  name: "get_source",
  title: "자료 원문 읽기",
  description: "자료 하나의 조각을 순서대로 읽는다 (검색으로 찾은 조각의 앞뒤 맥락, 또는 문서 전체). 한 번에 최대 40조각. (응답 형식 v2)",
  inputSchema: z.object({
    source_id: z.string().uuid(),
    from_ord: z.number().int().min(1).default(1).describe("시작 조각 번호 (1부터)"),
    count: z.number().int().min(1).max(40).default(20),
  }),
  async run(ctx, { source_id, from_ord, count }) {
    const s = await ctx.knowledge.getSource(source_id);
    if (!s) return fail("자료를 찾을 수 없거나 볼 권한이 없습니다.");
    const [{ chunks, total, nextOrd }, units] = await Promise.all([ctx.knowledge.readChunks(source_id, from_ord, count), ctx.catalog.listUnits(s.subjectId)]);
    return json({
      source: { id: s.id, title: s.title, kind: s.kind, url: s.url, unit_path: unitPathOf(units, s.unitId), page_range: s.pageRange, total_chunks: total },
      from_ord,
      next_ord: nextOrd,
      chunks: chunks.map((c) => ({ ord: c.ord, page: c.page, heading: c.heading, content: c.content })),
    });
  },
});

/** 이름으로 찾는 도구 (테스트·문서용) */
/** create_subject 제한: 최근 1시간에 만들어진 과목 수 (AI 가 폭주해 과목을 양산하지 못하게 — D-019) */
export const SUBJECT_CREATE_LIMIT_PER_HOUR = 5;

const createSubjectTool = defineTool({
  name: "create_subject",
  title: "과목 만들기",
  description: `새 과목을 만든다 (관리자만). 같은 이름이 이미 있으면 그 과목을 돌려준다. 1시간에 ${SUBJECT_CREATE_LIMIT_PER_HOUR}개까지. visibility: public(로그인 사용자 모두) / restricted(멤버만 — grant_member 로 추가). (응답 형식 v2)`,
  inputSchema: z.object({
    name: z.string().min(1).max(80).describe("과목 이름 (docs/glossary 의 과목 이름 규칙: 영어 과정은 영어 표기)"),
    visibility: z.enum(["public", "restricted"]).default("restricted"),
  }),
  async run(ctx, { name, visibility }) {
    if (!ctx.user.isAdmin) return fail("과목 만들기는 관리자 계정만 할 수 있습니다.");
    const existing = await ctx.catalog.listSubjects();
    const same = existing.find((s) => s.name.trim() === name.trim());
    if (same) return json({ id: same.id, name: same.name, visibility: same.visibility, created: false, note: "같은 이름의 과목이 이미 있어 그것을 돌려줍니다." });
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recent = existing.filter((s) => new Date(s.createdAt).getTime() > hourAgo).length;
    if (recent >= SUBJECT_CREATE_LIMIT_PER_HOUR) return fail(`최근 1시간에 과목을 ${recent}개 만들었습니다. 한 시간에 ${SUBJECT_CREATE_LIMIT_PER_HOUR}개까지만 만들 수 있습니다.`);
    const r = await ctx.catalog.createSubject(name.trim(), visibility);
    if (!r.ok) return fail(r.error);
    return json({ id: r.data.id, name: r.data.name, visibility: r.data.visibility, created: true, next: visibility === "restricted" ? "grant_member 로 볼 수 있는 사용자를 추가하세요." : "로그인한 모든 사용자가 볼 수 있습니다." });
  },
});

const grantMemberTool = defineTool({
  name: "grant_member",
  title: "과목 멤버 추가",
  description: "제한(restricted) 과목을 볼 수 있는 사용자를 이메일로 추가한다 (관리자만). 그 이메일로 먼저 가입돼 있어야 한다. (응답 형식 v2)",
  inputSchema: z.object({ subject_id: z.string().uuid(), email: z.string().email() }),
  async run(ctx, { subject_id, email }) {
    if (!ctx.user.isAdmin) return fail("멤버 추가는 관리자 계정만 할 수 있습니다.");
    const r = await ctx.access.grantMember(subject_id, email);
    return r.ok ? json({ subject_id, user_id: r.data.userId, email }) : fail(r.error);
  },
});

export const tools = {
  list_subjects: listSubjects,
  list_units: listUnits,
  list_questions: listQuestions,
  get_question: getQuestion,
  search_questions: searchQuestions,
  get_learning_summary: getLearningSummary,
  get_authoring_guide: getAuthoringGuide,
  import_questions: importQuestions,
  create_subject: createSubjectTool,
  grant_member: grantMemberTool,
  list_sources: listSources,
  search_sources: searchSources,
  get_source: getSource,
};

export type ToolName = keyof typeof tools;
export const TOOL_NAMES = Object.keys(tools) as ToolName[];
/** 등록 순서대로 (v1 과 같은 이름 11개) */
export const TOOL_LIST: AnyToolDef[] = Object.values(tools);
