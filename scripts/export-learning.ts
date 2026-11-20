/**
 * 학습 기록 내보내기 (service role). 출제 세션에 "유형 분석용 프롬프트" 로 넘길 Markdown 을 만든다.
 *   npm run export:learning -- <이메일> "<주제>" [--all] [--days N] [--out <경로>]
 *     --all    틀림·헷갈림·저장 문항만이 아니라 푼 문항 전부
 *     --days   최근 N일 기록만 (기본 전체)
 *     --top N  약한 문항을 많이 틀린 순으로 N개까지만 (프롬프트 길이 조절)
 *     --out    저장 경로 (기본 content/exports/<주제>_<날짜>.md)
 * 파일에는 이메일을 넣지 않는다("학습자"). content/ 는 git 에서 제외된다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adminDb, findSubject } from "./_db";
import { difficultyLabel, trapLabel, unitLabel } from "../src/domains/shared/labels";

type Db = ReturnType<typeof adminDb>;

/** 1000행 제한을 넘는 조회는 range 로 끊어 읽는다 */
async function allRows<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetch(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
const fmtKst = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/\s/g, "");

async function main() {
  const args = process.argv.slice(2);
  const pos = args.filter((a, i) => !a.startsWith("--") && !["--days", "--out", "--top"].includes(args[i - 1]));
  const top = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : null;
  const [email, subjectName] = pos;
  const all = args.includes("--all");
  const daysArg = args[args.indexOf("--days") + 1];
  const days = args.includes("--days") ? Number(daysArg) : null;
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  if (!email || !subjectName) {
    console.error('사용법: npm run export:learning -- <이메일> "<주제>" [--all] [--days N] [--out 경로]');
    process.exit(1);
  }
  const db: Db = adminDb();
  const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile) {
    console.error(`계정 ${email} 을 찾지 못했습니다.`);
    process.exit(1);
  }
  const subject = await findSubject(db, subjectName);
  const since = days ? new Date(Date.now() - days * 86400_000).toISOString() : null;

  const [units, questions] = await Promise.all([
    allRows((f, t) => db.from("units").select("id, no, title, parent_id, sort, priority").eq("subject_id", subject.id).range(f, t)),
    allRows((f, t) =>
      db.from("questions").select("id, unit_id, ord, prompt, correct_choice, topic, difficulty, trap_types, tags, explanation").eq("subject_id", subject.id).range(f, t),
    ),
  ]);
  const qIds = questions.map((q) => q.id);
  const byChunk = async <T,>(fn: (ids: string[]) => Promise<T[]>): Promise<T[]> => {
    const res: T[] = [];
    for (let i = 0; i < qIds.length; i += 200) res.push(...(await fn(qIds.slice(i, i + 200))));
    return res;
  };
  const choiceRows = await byChunk((ids) => allRows((f, t) => db.from("choices").select("question_id, ord, text").in("question_id", ids).range(f, t)));
  const attempts = await byChunk((ids) =>
    allRows((f, t) => {
      let q = db.from("attempts").select("question_id, selected_ord, is_correct, confused, created_at, elapsed_sec").eq("user_id", profile.id).in("question_id", ids);
      if (since) q = q.gte("created_at", since);
      return q.order("created_at").range(f, t);
    }),
  );
  const marks = await byChunk((ids) => allRows((f, t) => db.from("question_marks").select("question_id, kind").eq("user_id", profile.id).in("question_id", ids).range(f, t)));
  const aiQs = await allRows((f, t) =>
    db.from("ai_questions").select("question_id, question, created_at").eq("user_id", profile.id).eq("subject_id", subject.id).order("created_at").range(f, t),
  );

  // ---- 집계 ----
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitName = (id: string | null) => {
    const u = id ? unitById.get(id) : null;
    if (!u) return "단원 미지정";
    const own = unitLabel(u.no, u.title);
    const parent = u.parent_id ? unitById.get(u.parent_id) : null;
    return parent ? `${parent.title} › ${own}` : own;
  };
  const choiceText = new Map<string, string>();
  for (const c of choiceRows) choiceText.set(`${c.question_id}:${c.ord}`, c.text);
  type Agg = { graded: number; wrong: number; confused: number; last: boolean | null; lastAt: string | null; wrongPicks: Map<number, number>; secs: number[] };
  const agg = new Map<string, Agg>();
  for (const a of attempts) {
    const g: Agg = agg.get(a.question_id) ?? { graded: 0, wrong: 0, confused: 0, last: null, lastAt: null, wrongPicks: new Map<number, number>(), secs: [] };
    if (a.selected_ord !== null) {
      g.graded++;
      g.last = a.is_correct;
      g.lastAt = a.created_at;
      if (a.is_correct === false) {
        g.wrong++;
        g.wrongPicks.set(a.selected_ord, (g.wrongPicks.get(a.selected_ord) ?? 0) + 1);
      }
      if (a.elapsed_sec) g.secs.push(a.elapsed_sec);
    }
    if (a.confused) g.confused++;
    agg.set(a.question_id, g);
  }
  const saved = new Set(marks.filter((m) => m.kind === "saved").map((m) => m.question_id));
  const aiByQ = new Map<string, string[]>();
  for (const x of aiQs) if (x.question_id) aiByQ.set(x.question_id, [...(aiByQ.get(x.question_id) ?? []), x.question]);

  const allRowsSorted = questions
    .map((q) => ({ q, a: agg.get(q.id) }))
    .filter(({ q, a }) => (all ? !!a?.graded : (a?.wrong ?? 0) > 0 || (a?.confused ?? 0) > 0 || saved.has(q.id)))
    .sort((x, y) => (y.a?.wrong ?? 0) - (x.a?.wrong ?? 0) || (y.a?.confused ?? 0) - (x.a?.confused ?? 0) || (x.q.unit_id ?? "").localeCompare(y.q.unit_id ?? "") || x.q.ord - y.q.ord);
  const rows = top && top > 0 ? allRowsSorted.slice(0, top) : allRowsSorted;

  const sumBy = <K extends string>(keyOf: (q: (typeof questions)[number]) => K[]) => {
    const m = new Map<K, { n: number; graded: number; wrong: number; confused: number }>();
    for (const q of questions) {
      const a = agg.get(q.id);
      for (const k of keyOf(q)) {
        const s = m.get(k) ?? { n: 0, graded: 0, wrong: 0, confused: 0 };
        s.n++;
        if (a) {
          s.graded += a.graded;
          s.wrong += a.wrong;
          s.confused += a.confused;
        }
        m.set(k, s);
      }
    }
    return [...m.entries()].filter(([, s]) => s.graded > 0);
  };
  const totalGraded = [...agg.values()].reduce((s, a) => s + a.graded, 0);
  const totalWrong = [...agg.values()].reduce((s, a) => s + a.wrong, 0);
  const attemptedQ = [...agg.values()].filter((a) => a.graded > 0).length;

  // ---- Markdown ----
  const L: string[] = [];
  L.push(`# 학습 기록 분석 자료: ${subject.name}`);
  L.push(``);
  L.push(`기준일 ${fmtKst(new Date().toISOString())} (KST)${since ? `, 최근 ${days}일` : ""}. 한 학습자의 퀴즈 풀이 기록입니다.`);
  L.push(``);
  L.push(`## 이 자료로 해 주었으면 하는 것`);
  L.push(``);
  L.push(`1. 아래 "약한 문항" 의 공통점을 찾아 주세요: 자주 틀리는 단원·세부 주제, 함정 유형, 오답으로 고른 선지의 패턴(어떤 개념을 서로 바꿔 알고 있는지).`);
  L.push(`2. 그 분석을 바탕으로 다음 출제에서 비중을 높일 주제와 문제 유형을 제안해 주세요. 같은 문항을 다시 내지 말고, 같은 개념을 다른 각도(정의·비교·적용·계산)로 묻는 새 문항을 만들어 주세요.`);
  L.push(`3. 학습자가 AI 에게 물은 질문이 있으면 어디에서 막혔는지 참고해 주세요.`);
  L.push(``);
  L.push(`## 전체 요약`);
  L.push(``);
  L.push(`- 문항 ${questions.length}개 중 ${attemptedQ}개를 풀었고, 채점 ${totalGraded}회 중 오답 ${totalWrong}회 (오답률 ${pct(totalWrong, totalGraded)}).`);
  L.push(`- 약한 문항(틀림·헷갈림·직접 저장) ${allRowsSorted.length}개. 이 중 2회 이상 틀림 ${allRowsSorted.filter((r) => (r.a?.wrong ?? 0) >= 2).length}개.${rows.length < allRowsSorted.length ? ` 아래에는 많이 틀린 순으로 ${rows.length}개만 실었습니다.` : ""}`);
  L.push(``);
  const table = (title: string, entries: [string, { n: number; graded: number; wrong: number; confused: number }][], label: (k: string) => string) => {
    if (!entries.length) return;
    L.push(`## ${title}`);
    L.push(``);
    L.push(`| 구분 | 문항 | 채점 | 오답 | 오답률 | 헷갈림 |`);
    L.push(`|---|---:|---:|---:|---:|---:|`);
    for (const [k, s] of entries.sort((a, b) => b[1].wrong / Math.max(1, b[1].graded) - a[1].wrong / Math.max(1, a[1].graded)))
      L.push(`| ${label(k)} | ${s.n} | ${s.graded} | ${s.wrong} | ${pct(s.wrong, s.graded)} | ${s.confused} |`);
    L.push(``);
  };
  table("단원별", sumBy((q) => [q.unit_id ?? "__none__"]), (k) => unitName(k === "__none__" ? null : k));
  table("세부 주제별 (오답 있는 것만)", sumBy((q) => (q.topic ? [q.topic] : [])).filter(([, s]) => s.wrong > 0), (k) => k);
  table("난이도별", sumBy((q) => (q.difficulty ? [q.difficulty] : [])), (k) => difficultyLabel(k) ?? k);
  table("함정 유형별", sumBy((q) => q.trap_types ?? []), (k) => trapLabel(k));

  L.push(`## 약한 문항 (${rows.length}개, 많이 틀린 순)`);
  L.push(``);
  for (const { q, a } of rows) {
    const flags: string[] = [];
    if (a?.wrong) flags.push(`${a.wrong}회 틀림 / ${a.graded}회 풀이`);
    else if (a?.graded) flags.push(`${a.graded}회 풀이, 틀린 적 없음`);
    if (a?.confused) flags.push(`헷갈림 ${a.confused}회`);
    if (saved.has(q.id)) flags.push("직접 저장");
    if (a?.last !== null && a?.last !== undefined) flags.push(`최근 ${a.last ? "정답" : "오답"}${a.lastAt ? ` (${fmtKst(a.lastAt)})` : ""}`);
    if (a?.secs.length) flags.push(`평균 ${Math.round(a.secs.reduce((s, v) => s + v, 0) / a.secs.length)}초`);
    L.push(`### ${unitName(q.unit_id)} · ${q.ord}번`);
    L.push(``);
    L.push(`- 상태: ${flags.join(" · ") || "-"}`);
    const meta = [q.topic && `주제: ${q.topic}`, q.difficulty && `난이도: ${difficultyLabel(q.difficulty) ?? q.difficulty}`, q.trap_types?.length && `함정: ${q.trap_types.map((t) => trapLabel(t)).join(", ")}`].filter(Boolean);
    if (meta.length) L.push(`- ${meta.join(" · ")}`);
    L.push(`- 문제: ${q.prompt.replace(/\s*\n\s*/g, " ")}`);
    const ords = [...new Set(choiceRows.filter((c) => c.question_id === q.id).map((c) => c.ord))].sort((x, y) => x - y);
    for (const o of ords) {
      const mark = o === q.correct_choice ? "정답" : a?.wrongPicks.get(o) ? `오답으로 ${a.wrongPicks.get(o)}회 고름` : "";
      L.push(`  - ${o}) ${choiceText.get(`${q.id}:${o}`) ?? ""}${mark ? `  ← ${mark}` : ""}`);
    }
    if (q.explanation) L.push(`- 해설: ${q.explanation.replace(/\s*\n\s*/g, " ").slice(0, 300)}`);
    const asked = aiByQ.get(q.id);
    if (asked?.length) L.push(`- 학습자가 AI 에게 물은 것: ${asked.map((s) => `"${s.replace(/\s+/g, " ").slice(0, 120)}"`).join(" / ")}`);
    L.push(``);
  }

  const path = out ?? join("content", "exports", `${subject.name.replace(/[\\/:*?"<>|\s]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.md`);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, L.join("\n"), "utf8");
  console.log(`${path}  (${rows.length}문항, ${L.join("\n").length.toLocaleString()}자)`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
