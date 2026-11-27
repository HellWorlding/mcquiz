import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { clientFromAuth, type McpClient } from "./auth";
import { buildSavedExport, type ExportQuestion, type ExportRecord, type ExportUnit } from "@/domains/progress/export";
import { parseJsonQuestions } from "@/domains/import/parse-json";
import { saveQuestionSet, validateQuestions } from "@/domains/import/save";
import { ensureUnitPath, normalizeTarget } from "@/domains/import/targets";
import type { PreviewQuestion } from "@/domains/import/types";
import { unitLabel } from "@/domains/shared/labels";
import type { Unit } from "@/domains/shared/types";

/**
 * MCP 도구. 외부 AI(Claude, ChatGPT 등)가 사용자의 과목·문항·학습 기록을 읽고, 관리자는 문항을 넣는다.
 * 모든 조회는 사용자 토큰 클라이언트로 하므로 RLS 가 그대로 적용된다 (볼 수 없는 과목은 애초에 안 나온다).
 */

type Stat = {
  question_id: string;
  unit_id: string | null;
  attempt_count: number;
  wrong_count: number;
  last_correct: boolean | null;
  last_graded_at: string | null;
  wrong_after: boolean;
  confused_after: boolean;
  saved: boolean;
};

const QUESTION_COLS = "id, subject_id, unit_id, ord, prompt, correct_choice, topic, difficulty, trap_types, tags, explanation, hint, source_quote, source_page, choices(ord, text, explanation)";

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });
/** 도구 실행 시간을 기록하고, 45초를 넘기거나 예외가 나면 오류 응답으로 바꾼다 (요청이 매달리지 않게) */
async function timed<T>(name: string, fn: () => Promise<T>): Promise<T | ReturnType<typeof fail>> {
  const t0 = Date.now();
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${name} 이(가) 45초를 넘겨 중단했습니다`)), 45_000));
  try {
    const r = await Promise.race([fn(), timeout]);
    console.log(`[mcp] tool ${name} ${Date.now() - t0}ms`);
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[mcp] tool ${name} failed ${Date.now() - t0}ms ${msg}`);
    return fail(`오류: ${msg}`);
  }
}


async function loadUnits(db: McpClient, subjectId: string): Promise<Unit[]> {
  const { data, error } = await db.from("units").select("*").eq("subject_id", subjectId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** 과목의 모든 문항 id·단원 (my_question_stats 는 풀거나 표시한 문항만 돌려주므로 안 푼 문항은 여기서 채운다) */
async function loadIndex(db: McpClient, subjectId: string): Promise<{ id: string; unit_id: string | null }[]> {
  const out: { id: string; unit_id: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("questions").select("id, unit_id").eq("subject_id", subjectId).order("unit_id").order("ord").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadStats(db: McpClient, subjectId: string): Promise<Stat[]> {
  const { data, error } = await db.rpc("my_question_stats", { p_subject: subjectId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Stat[]).filter((s) => !!s.question_id);
}

type LoadedQuestion = ExportQuestion & { subject_id: string };
async function loadQuestions(db: McpClient, ids: string[]): Promise<LoadedQuestion[]> {
  const out: LoadedQuestion[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("questions").select(QUESTION_COLS).in("id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const q of data ?? []) out.push({ ...q, choices: [...(q.choices ?? [])].sort((a, b) => a.ord - b.ord) });
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function recordOf(s: Stat | undefined, note: string | null = null): ExportRecord {
  return {
    attempts: s?.attempt_count ?? 0,
    wrong: s?.wrong_count ?? 0,
    confused: s?.confused_after ? 1 : 0,
    last: s?.last_correct ?? null,
    lastAt: s?.last_graded_at ?? null,
    wrongPicks: {},
    avgSec: null,
    saved: s?.saved ?? false,
    note,
  };
}

const FILTERS = ["all", "unsolved", "wrong", "repeat", "confused", "saved", "weak"] as const;
type Filter = (typeof FILTERS)[number];
function matches(s: Stat | undefined, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "unsolved":
      return !s || s.attempt_count === 0;
    case "wrong":
      return !!s?.wrong_after;
    case "repeat":
      return (s?.wrong_count ?? 0) >= 2;
    case "confused":
      return !!s?.confused_after;
    case "saved":
      return !!s?.saved;
    case "weak":
      return !!(s?.wrong_after || s?.confused_after || s?.saved);
  }
}

/** 단원 id 와 그 아래 모든 단원 id */
function descendants(units: Unit[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const u of units) if (u.parent_id === id && !out.has(u.id)) {
      out.add(u.id);
      stack.push(u.id);
    }
  }
  return out;
}

function unitPathOf(units: ExportUnit[], unitId: string | null): string[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const path: string[] = [];
  let cur = unitId ? byId.get(unitId) : undefined;
  let guard = 0;
  while (cur && guard++ < 10) {
    path.unshift(unitLabel(cur.no, cur.title));
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path;
}

const AUTHORING_GUIDE = `# mcquiz 출제 형식 안내

문항은 JSON 배열로 만든다. 한 파일(또는 import_questions 한 번)에 한 소단원이 보통이다.

각 문항:
{
  "subject": "<과목 이름, list_subjects 의 name 그대로>",
  "unit_path": ["<대단원>", "<소단원>"],   // 기존 단원이면 list_units 의 path 와 글자까지 같게. 새 소단원은 마지막 요소만 새 이름
  "no": 1,                                   // 1부터 순서대로
  "prompt": "<질문. 코드가 있으면 줄바꿈 포함 가능>",
  "topic": "<세부 주제 한 구절>",
  "difficulty": "easy" | "medium" | "hard" | "very_hard",
  "trap_types": ["scope_change", ...],       // 선택. 오답 선지에 쓴 함정 유형
  "correct_choice": 1..4(또는 5),             // 선지 ord
  "explanation": "<해설. 선지 번호를 쓰지 말 것: 선지는 화면마다 섞인다. 선지 내용을 직접 인용해서 설명>",
  "hint": null | "<한 줄 힌트>",
  "source_quote": null | "<근거 원문 문장>",
  "source_page": null | 123,
  "choices": [ { "ord": 1, "text": "..." }, { "ord": 2, "text": "..." }, { "ord": 3, "text": "..." }, { "ord": 4, "text": "..." } ]
}

규칙:
- 선지는 4개(또는 5개) 모두 같은 형식·비슷한 길이. 정답 번호는 1~4 에 고르게.
- 해설·선지 어디에도 "1번", "③" 같은 번호 참조를 쓰지 않는다 (섞이면 틀린 말이 된다).
- 같은 과목에 이미 있는 문항(search_questions 로 확인)과 질문문이 같거나 거의 같으면 내지 않는다. 같은 개념은 다른 각도(정의·비교·적용·계산)로.
- 난이도 분포는 요청이 없으면 하 1/3, 중 1/3, 상 1/3.
- 넣기 전 import_questions 를 mode="check" 로 먼저 불러 형식·중복을 확인하고, 문제 없으면 mode="commit".
`;

export function registerTools(server: McpServer) {
  server.registerTool(
    "list_subjects",
    {
      title: "과목 목록",
      description: "내가 볼 수 있는 과목과 문항 수. 다른 도구의 subject_id 는 여기서 얻는다.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      return timed("list_subjects", async () => {
        const { db } = clientFromAuth(ctx.http?.authInfo);
        const { data, error } = await db.from("subjects").select("id, name, visibility").order("name");
        if (error) return fail(error.message);
        const out = [];
        for (const s of data ?? []) {
          const { count } = await db.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", s.id);
          out.push({ id: s.id, name: s.name, visibility: s.visibility, question_count: count ?? 0 });
        }
        return json(out);
      });
    },
  );

  server.registerTool(
    "list_units",
    {
      title: "단원 트리",
      description: "과목의 단원 트리. 단원마다 경로(path), 문항 수, 우선순위, 내 회독별 점수(round_scores: k번째 풀이에서 n개 중 correct개).",
      inputSchema: z.object({ subject_id: z.string().uuid() }),
    },
    async ({ subject_id }, ctx) => {
      return timed("list_units", async () => {
        const { db } = clientFromAuth(ctx.http?.authInfo);
        const [units, index, { data: rs }] = await Promise.all([loadUnits(db, subject_id), loadIndex(db, subject_id), db.rpc("my_unit_round_scores", { p_subject: subject_id })]);
        const count = new Map<string, number>();
        for (const s of index) count.set(s.unit_id ?? "", (count.get(s.unit_id ?? "") ?? 0) + 1);
        const rounds = new Map<string, { round: number; n: number; correct: number }[]>();
        for (const r of rs ?? []) {
          const k = r.unit_id ?? "";
          rounds.set(k, [...(rounds.get(k) ?? []), { round: r.round_no, n: Number(r.n), correct: Number(r.n_correct) }]);
        }
        const rows = units
          .map((u) => ({
            id: u.id,
            parent_id: u.parent_id,
            no: u.no,
            title: u.title,
            path: unitPathOf(units, u.id),
            priority: u.priority,
            question_count: count.get(u.id) ?? 0,
            round_scores: (rounds.get(u.id) ?? []).sort((a, b) => a.round - b.round),
          }))
          .sort((a, b) => a.path.join("/").localeCompare(b.path.join("/"), "ko"));
        return json(rows);
      });
    },
  );

  server.registerTool(
    "list_questions",
    {
      title: "문항 목록",
      description:
        "문항 원문(질문·선지·정답·해설·근거)과 내 기록(my_record). filter: all | unsolved(안 푼 것) | wrong(틀림) | repeat(2회 이상 틀림) | confused(헷갈림) | saved(직접 저장) | weak(틀림·헷갈림·저장 중 하나). unit_id 를 주면 그 단원과 하위 단원만. 많이 틀린 순.",
      inputSchema: z.object({
        subject_id: z.string().uuid(),
        unit_id: z.string().uuid().optional(),
        filter: z.enum(FILTERS).default("all"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        format: z.enum(["json", "markdown"]).default("json"),
      }),
    },
    async ({ subject_id, unit_id, filter, limit, offset, format }, ctx) => {
      return timed("list_questions", async () => {
        const { db } = clientFromAuth(ctx.http?.authInfo);
        const [units, index, stats, { data: subject }] = await Promise.all([loadUnits(db, subject_id), loadIndex(db, subject_id), loadStats(db, subject_id), db.from("subjects").select("name").eq("id", subject_id).maybeSingle()]);
        if (!subject) return fail("과목을 찾을 수 없거나 볼 권한이 없습니다.");
        const scope = unit_id ? descendants(units, unit_id) : null;
        const statById = new Map(stats.map((s) => [s.question_id, s]));
        const picked = index
          .filter((x) => (!scope || (x.unit_id && scope.has(x.unit_id))) && matches(statById.get(x.id), filter))
          .sort((a, b) => (statById.get(b.id)?.wrong_count ?? 0) - (statById.get(a.id)?.wrong_count ?? 0));
        const total = picked.length;
        const page = picked.slice(offset, offset + limit);
        const questions = await loadQuestions(db, page.map((x) => x.id));
        const rows = questions.map((q) => ({ q, r: recordOf(statById.get(q.id)) }));
        const built = buildSavedExport({ subjectName: subject.name, exportedAt: new Date().toISOString(), filterLabel: filter === "all" ? null : filter, units, rows });
        if (format === "markdown") return text(`total=${total} offset=${offset} returned=${rows.length}\n\n${built.markdown}`);
        const j = built.json as { questions: unknown[] };
        return json({ total, offset, returned: rows.length, questions: j.questions });
      });
    },
  );

  server.registerTool(
    "get_question",
    {
      title: "문항 하나",
      description: "문항 id 로 원문과 내 기록을 본다.",
      inputSchema: z.object({ question_id: z.string().uuid() }),
    },
    async ({ question_id }, ctx) => {
      return timed("get_question", async () => {
        const { db } = clientFromAuth(ctx.http?.authInfo);
        const [q] = await loadQuestions(db, [question_id]);
        if (!q) return fail("문항을 찾을 수 없거나 볼 권한이 없습니다.");
        const { data: subject } = await db.from("subjects").select("name").eq("id", q.subject_id).maybeSingle();
        const units = await loadUnits(db, q.subject_id);
        const stats = await loadStats(db, q.subject_id);
        const { data: note } = await db.from("question_notes").select("content").eq("question_id", question_id).maybeSingle();
        const built = buildSavedExport({ subjectName: subject?.name ?? "", exportedAt: new Date().toISOString(), filterLabel: null, units, rows: [{ q, r: recordOf(stats.find((s) => s.question_id === question_id), note?.content ?? null) }] });
        return json({ id: q.id, ...(built.json as { questions: Record<string, unknown>[] }).questions[0] });
      });
    },
  );

  server.registerTool(
    "search_questions",
    {
      title: "문항 검색",
      description: "질문문·해설에서 글자 검색. 새 문항을 내기 전 중복 확인용.",
      inputSchema: z.object({ subject_id: z.string().uuid(), query: z.string().min(2).max(200), limit: z.number().int().min(1).max(50).default(20) }),
    },
    async ({ subject_id, query, limit }, ctx) => {
      return timed("search_questions", async () => {
        const { db } = clientFromAuth(ctx.http?.authInfo);
        const pat = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`;
        const { data, error } = await db.from("questions").select("id, unit_id, ord, prompt, topic").eq("subject_id", subject_id).or(`prompt.ilike.${pat},explanation.ilike.${pat}`).limit(limit);
        if (error) return fail(error.message);
        const units = await loadUnits(db, subject_id);
        return json((data ?? []).map((q) => ({ id: q.id, unit_path: unitPathOf(units, q.unit_id), no: q.ord, prompt: q.prompt, topic: q.topic })));
      });
    },
  );

  server.registerTool(
    "get_learning_summary",
    {
      title: "학습 기록 분석 자료",
      description: "출제·분석용 Markdown. 단원별 오답 표와 약한 문항(틀림·헷갈림·저장)을 많이 틀린 순으로 담는다. 앱의 '저장함 내보내기'와 같은 내용.",
      inputSchema: z.object({ subject_id: z.string().uuid(), unit_id: z.string().uuid().optional(), top: z.number().int().min(1).max(300).default(60) }),
    },
    async ({ subject_id, unit_id, top }, ctx) => {
      return timed("get_learning_summary", async () => {
        const { db } = clientFromAuth(ctx.http?.authInfo);
        const [units, index, stats, { data: subject }] = await Promise.all([loadUnits(db, subject_id), loadIndex(db, subject_id), loadStats(db, subject_id), db.from("subjects").select("name").eq("id", subject_id).maybeSingle()]);
        if (!subject) return fail("과목을 찾을 수 없거나 볼 권한이 없습니다.");
        const scope = unit_id ? descendants(units, unit_id) : null;
        const inScope = index.filter((x) => !scope || (x.unit_id && scope.has(x.unit_id)));
        const weak = stats
          .filter((s) => (!scope || (s.unit_id && scope.has(s.unit_id))) && matches(s, "weak"))
          .sort((a, b) => b.wrong_count - a.wrong_count)
          .slice(0, top);
        const statById = new Map(stats.map((s) => [s.question_id, s]));
        const questions = await loadQuestions(db, weak.map((s) => s.question_id));
        const ids = questions.map((q) => q.id);
        const notes = new Map<string, string>();
        for (let i = 0; i < ids.length; i += 100) {
          const { data } = await db.from("question_notes").select("question_id, content").in("question_id", ids.slice(i, i + 100));
          for (const n of data ?? []) notes.set(n.question_id, n.content);
        }
        const scopeIds = new Set(inScope.map((x) => x.id));
        const graded = stats.filter((s) => s.attempt_count > 0 && scopeIds.has(s.question_id));
        const head = `전체: 문항 ${inScope.length}개 중 ${graded.length}개 풀었음, 안 푼 문항 ${inScope.length - graded.length}개, 최근 풀이 기준 정답 ${graded.filter((s) => s.last_correct).length}/${graded.length}.\n\n`;
        const built = buildSavedExport({ subjectName: subject.name, exportedAt: new Date().toISOString(), filterLabel: "틀림·헷갈림·직접 저장", units, rows: questions.map((q) => ({ q, r: recordOf(statById.get(q.id), notes.get(q.id) ?? null) })) });
        return text(head + built.markdown);
      });
    },
  );

  server.registerTool(
    "get_authoring_guide",
    {
      title: "출제 형식 안내",
      description: "새 문항을 만들 때 지켜야 할 JSON 형식과 규칙, 그리고 과목의 기존 단원 경로 목록. 출제 전에 한 번 읽는다.",
      inputSchema: z.object({ subject_id: z.string().uuid().optional() }),
    },
    async ({ subject_id }, ctx) => {
      return timed("get_authoring_guide", async () => {
        const { db } = clientFromAuth(ctx.http?.authInfo);
        let extra = "";
        if (subject_id) {
          const [{ data: subject }, units] = await Promise.all([db.from("subjects").select("name").eq("id", subject_id).maybeSingle(), loadUnits(db, subject_id)]);
          if (subject) {
            const leaves = units.filter((u) => !units.some((c) => c.parent_id === u.id));
            extra = `\n## 이 과목의 기존 단원 경로 (subject = "${subject.name}")\n\n${leaves
              .map((u) => `- ${JSON.stringify(unitPathOf(units, u.id))}`)
              .sort()
              .join("\n")}\n`;
            const { data: sample } = await db.from("questions").select(QUESTION_COLS).eq("subject_id", subject_id).limit(1).maybeSingle();
            if (sample) {
              const ex = {
                subject: subject.name,
                unit_path: unitPathOf(units, sample.unit_id),
                no: 1,
                prompt: sample.prompt,
                topic: sample.topic,
                difficulty: sample.difficulty,
                trap_types: sample.trap_types ?? [],
                correct_choice: sample.correct_choice,
                explanation: sample.explanation,
                hint: sample.hint,
                source_quote: sample.source_quote,
                source_page: sample.source_page,
                choices: [...(sample.choices ?? [])].sort((a, b) => a.ord - b.ord).map((c) => ({ ord: c.ord, text: c.text })),
              };
              extra += `\n## 이 과목의 실제 문항 예시\n\n\`\`\`json\n${JSON.stringify(ex, null, 2)}\n\`\`\`\n`;
            }
          }
        }
        return text(AUTHORING_GUIDE + extra);
      });
    },
  );

  server.registerTool(
    "import_questions",
    {
      title: "문항 넣기",
      description:
        "문항 JSON 배열을 과목에 넣는다 (관리자만). mode=check 는 형식 검사·중복 확인 결과만 돌려주고 아무것도 바꾸지 않는다. mode=commit 은 실제로 넣는다. 항상 check 를 먼저 하라. 각 문항의 subject 와 unit_path 로 과목·단원이 정해지고, 없는 소단원은 만들어진다.",
      inputSchema: z.object({
        questions: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
        mode: z.enum(["check", "commit"]).default("check"),
        set_title: z.string().max(120).optional(),
      }),
    },
    async ({ questions, mode, set_title }, ctx) => {
      return timed("import_questions", async () => {
        const { db, userId } = clientFromAuth(ctx.http?.authInfo);
        const { data: isAdmin } = await db.rpc("is_admin");
        if (!isAdmin) return fail("문항 넣기는 관리자 계정만 할 수 있습니다.");
        const parsed = parseJsonQuestions(JSON.stringify(questions));
        if (parsed.questions.length === 0) return fail(`문항을 읽지 못했습니다: ${parsed.warnings.join("; ") || "형식을 확인하세요"}`);
        // 과목 찾기 (이름 그대로; 없는 과목은 만들지 않는다)
        const { data: subjects } = await db.from("subjects").select("id, name");
        const subjectByName = new Map((subjects ?? []).map((s) => [s.name, s.id]));
        const unitsCache = new Map<string, Unit[]>();
        const preview: PreviewQuestion[] = [];
        const problems: string[] = [];
        for (let i = 0; i < parsed.questions.length; i++) {
          const q = parsed.questions[i];
          const t = normalizeTarget(q.subjectName, q.unitPath);
          const sid = t.subject ? subjectByName.get(t.subject) : null;
          if (!sid) {
            problems.push(`#${i + 1}: 과목 "${t.subject ?? "(없음)"}" 을 찾을 수 없습니다. list_subjects 의 이름을 그대로 쓰세요.`);
            continue;
          }
          if (!t.unitPath?.length) {
            problems.push(`#${i + 1}: unit_path 가 없습니다.`);
            continue;
          }
          if (!unitsCache.has(sid)) unitsCache.set(sid, await loadUnits(db, sid));
          const units = unitsCache.get(sid)!;
          // check 모드에서는 단원을 만들지 않고 있는지만 본다
          let unitId: string | null = null;
          if (mode === "commit") unitId = await ensureUnitPath(db, sid, t.unitPath, units);
          else {
            let parent: string | null = null;
            for (const title of t.unitPath) {
              const found = units.find((u) => u.parent_id === parent && u.title === title);
              if (!found) {
                unitId = null;
                break;
              }
              parent = found.id;
              unitId = found.id;
            }
            if (!unitId) problems.push(`#${i + 1}: 단원 ${JSON.stringify(t.unitPath)} 은 새로 만들어집니다 (기존 단원이면 이름을 글자까지 맞추세요).`);
          }
          preview.push({ ...q, key: `q${i}`, subjectId: sid, unitId, unitConfidence: 1, unitCandidates: [] });
        }
        // 정답이 없거나(번호가 선지 범위를 벗어나 파서가 비운 경우 포함) 파서 경고가 있는 문항은 넣지 않는다
        const noAnswer = new Set(preview.filter((q) => q.correct === null).map((q) => q.key));
        for (const q of preview) {
          const i = Number(q.key.slice(1)) + 1;
          if (noAnswer.has(q.key)) problems.push(`#${i}: 정답(correct_choice)이 없거나 선지 범위를 벗어납니다 — ${q.prompt.slice(0, 40)}`);
          for (const w of q.warnings) if (!w.startsWith("정답이 없습니다")) problems.push(`#${i}: ${w}`);
        }
        const { valid, failed } = validateQuestions(preview.filter((q) => !noAnswer.has(q.key)));
        for (const f of failed) problems.push(`#${f.index + 1}: ${f.reason} — ${f.prompt.slice(0, 40)}`);
        // 중복: 같은 과목에 질문문이 같은 문항
        const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
        const dup: string[] = [];
        for (const sid of new Set(valid.map((q) => q.subjectId!))) {
          const prompts = valid.filter((q) => q.subjectId === sid).map((q) => q.prompt);
          for (let i = 0; i < prompts.length; i += 50) {
            const { data } = await db.from("questions").select("prompt").eq("subject_id", sid).in("prompt", prompts.slice(i, i + 50));
            for (const r of data ?? []) dup.push(r.prompt);
          }
        }
        const dupSet = new Set(dup.map(norm));
        const duplicates = valid.filter((q) => dupSet.has(norm(q.prompt))).map((q) => q.prompt.slice(0, 60));
        const report = { mode, received: questions.length, valid: valid.length, failed: failed.length + noAnswer.size, duplicates_with_existing: duplicates.length, problems, duplicates };
        if (mode === "check") return json({ ...report, next: problems.length === 0 && duplicates.length === 0 ? "문제 없음. mode=commit 으로 다시 부르면 넣습니다." : "위 문제를 고친 뒤 다시 check 하세요. 중복 문항은 commit 시 같은 단원이면 덮어쓰고, 다른 단원이면 새로 들어갑니다." });
        if (valid.length === 0) return fail("넣을 수 있는 문항이 없습니다.");
        const results: { subject: string; inserted: number; updated: number }[] = [];
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
        for (const sid of new Set(valid.map((q) => q.subjectId!))) {
          const r = await saveQuestionSet(db, {
            subjectId: sid,
            title: set_title ?? `MCP ${stamp}`,
            sourceFilename: null,
            createdBy: userId,
            questions: valid.filter((q) => q.subjectId === sid),
          });
          results.push({ subject: [...subjectByName.entries()].find(([, v]) => v === sid)?.[0] ?? sid, inserted: r.inserted, updated: r.updated });
        }
        return json({ ...report, results });
      });
    },
  );
}
