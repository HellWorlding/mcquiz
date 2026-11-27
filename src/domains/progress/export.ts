/**
 * 저장함 내보내기: 문항 원문 + 내 풀이 기록을 JSON 과 Markdown 으로 만든다.
 * JSON 은 문제 파일 형식(subject, unit_path, prompt, choices…)을 그대로 따르고 my_record 만 덧붙여서,
 * 다른 AI 가 같은 형식으로 보충 문항을 돌려주면 그대로 다시 가져올 수 있다.
 * 순수 함수라 서버 액션과 테스트에서 함께 쓴다.
 */
import { difficultyLabel, trapLabel, unitLabel } from "@/domains/shared/labels";

export type ExportUnit = { id: string; no: number | null; title: string; parent_id: string | null };

export type ExportQuestion = {
  id: string;
  unit_id: string | null;
  ord: number;
  prompt: string;
  correct_choice: number | null;
  topic: string | null;
  difficulty: string | null;
  trap_types: string[] | null;
  tags: string[] | null;
  explanation: string | null;
  hint: string | null;
  source_quote: string | null;
  source_page: number | null;
  choices: { ord: number; text: string; explanation: string | null }[];
};

/** 한 문항에 대한 내 기록 (attempts·marks·notes 를 모아 만든다) */
export type ExportRecord = {
  attempts: number;
  wrong: number;
  confused: number;
  last: boolean | null;
  lastAt: string | null;
  /** 오답으로 고른 선지 번호 → 횟수 */
  wrongPicks: Record<number, number>;
  avgSec: number | null;
  saved: boolean;
  note: string | null;
};

export type SavedExportInput = {
  subjectName: string;
  exportedAt: string;
  /** 어떤 조건으로 거른 목록인지 (예: "틀림 + 2회 이상 틀림") */
  filterLabel: string | null;
  units: ExportUnit[];
  rows: { q: ExportQuestion; r: ExportRecord }[];
};

const KST_DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDate = (iso: string) => KST_DATE.format(new Date(iso)).replace(/\s/g, "");
const fmtTime = (iso: string) => KST_TIME.format(new Date(iso)).replace(/\s/g, " ");
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

/** 단원 경로: 최상위 → 말단 (제목에 번호가 없으면 "N강" 식으로 붙인다) */
export function unitPathOf(units: ExportUnit[], unitId: string | null): string[] {
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

export function buildSavedExport(input: SavedExportInput): { json: unknown; markdown: string } {
  const { subjectName, exportedAt, filterLabel, units, rows } = input;
  const sorted = [...rows].sort(
    (x, y) => y.r.wrong - x.r.wrong || y.r.confused - x.r.confused || (x.q.unit_id ?? "").localeCompare(y.q.unit_id ?? "") || x.q.ord - y.q.ord,
  );

  // ---- JSON ----
  const json = {
    format: "mcquiz-saved-export",
    version: 1,
    exported_at: exportedAt,
    subject: subjectName,
    filter: filterLabel,
    count: sorted.length,
    questions: sorted.map(({ q, r }) => ({
      subject: subjectName,
      unit_path: unitPathOf(units, q.unit_id),
      no: q.ord,
      prompt: q.prompt,
      topic: q.topic,
      difficulty: q.difficulty,
      trap_types: q.trap_types ?? [],
      tags: q.tags ?? [],
      correct_choice: q.correct_choice,
      explanation: q.explanation,
      hint: q.hint,
      source_quote: q.source_quote,
      source_page: q.source_page,
      choices: q.choices.map((c) => ({ ord: c.ord, text: c.text, explanation: c.explanation })),
      my_record: {
        attempts: r.attempts,
        wrong_count: r.wrong,
        confused_count: r.confused,
        last_result: r.last === null ? null : r.last ? "correct" : "wrong",
        last_solved_at: r.lastAt,
        wrong_picks: Object.entries(r.wrongPicks)
          .map(([ord, count]) => ({ ord: Number(ord), text: q.choices.find((c) => c.ord === Number(ord))?.text ?? "", count }))
          .sort((a, b) => b.count - a.count),
        avg_seconds: r.avgSec,
        saved_by_me: r.saved,
        note: r.note,
      },
    })),
  };

  // ---- Markdown ----
  const L: string[] = [];
  L.push(`# 저장함 내보내기: ${subjectName}`);
  L.push(``);
  L.push(`기준 ${fmtDate(exportedAt)} (KST). 한 학습자가 퀴즈 앱에서 틀리거나 헷갈리거나 직접 저장한 문항 ${sorted.length}개와 풀이 기록입니다.${filterLabel ? ` 조건: ${filterLabel}.` : ""}`);
  L.push(``);
  L.push(`## 이 자료로 해 주었으면 하는 것`);
  L.push(``);
  L.push(`1. 아래 문항들의 공통점을 찾아 주세요: 자주 틀리는 단원·세부 주제, 함정 유형, 오답으로 고른 선지에서 보이는 개념 혼동.`);
  L.push(`2. 그 분석을 바탕으로 보충 학습 순서와 다음 출제에서 비중을 높일 주제를 제안해 주세요.`);
  L.push(`3. 새 문항을 만든다면 같은 문항을 다시 내지 말고, 같은 개념을 다른 각도(정의·비교·적용·계산)로 물어 주세요. 형식은 함께 받은 JSON 과 같게(subject, unit_path, prompt, choices[ord,text], correct_choice, explanation), 해설에 선지 번호를 쓰지 마세요.`);
  L.push(``);

  const wrongTotal = sorted.reduce((s, x) => s + x.r.wrong, 0);
  const repeat = sorted.filter((x) => x.r.wrong >= 2).length;
  const confusedN = sorted.filter((x) => x.r.confused > 0).length;
  const savedN = sorted.filter((x) => x.r.saved).length;
  L.push(`## 요약`);
  L.push(``);
  L.push(`- 문항 ${sorted.length}개, 오답 합계 ${wrongTotal}회. 2회 이상 틀림 ${repeat}개, 헷갈림 표시 ${confusedN}개, 직접 저장 ${savedN}개.`);
  L.push(``);

  // 단원별 표
  const byUnit = new Map<string, { n: number; wrong: number; confused: number }>();
  for (const { q, r } of sorted) {
    const k = q.unit_id ?? "__none__";
    const s = byUnit.get(k) ?? { n: 0, wrong: 0, confused: 0 };
    s.n++;
    s.wrong += r.wrong;
    s.confused += r.confused;
    byUnit.set(k, s);
  }
  if (byUnit.size > 1) {
    L.push(`## 단원별`);
    L.push(``);
    L.push(`| 단원 | 문항 | 오답 | 헷갈림 |`);
    L.push(`|---|---:|---:|---:|`);
    for (const [k, s] of [...byUnit.entries()].sort((a, b) => b[1].wrong - a[1].wrong || b[1].n - a[1].n)) {
      const name = k === "__none__" ? "단원 미지정" : unitPathOf(units, k).join(" › ");
      L.push(`| ${name} | ${s.n} | ${s.wrong} | ${s.confused} |`);
    }
    L.push(``);
  }

  L.push(`## 문항 (많이 틀린 순)`);
  L.push(``);
  for (const { q, r } of sorted) {
    const flags: string[] = [];
    if (r.wrong) flags.push(`${r.wrong}회 틀림 / ${r.attempts}회 풀이`);
    else if (r.attempts) flags.push(`${r.attempts}회 풀이, 틀린 적 없음`);
    else flags.push(`아직 안 풂`);
    if (r.confused) flags.push(`헷갈림 ${r.confused}회`);
    if (r.saved) flags.push(`직접 저장`);
    if (r.last !== null) flags.push(`최근 ${r.last ? "정답" : "오답"}${r.lastAt ? ` (${fmtTime(r.lastAt)})` : ""}`);
    if (r.avgSec) flags.push(`평균 ${r.avgSec}초`);
    const path = unitPathOf(units, q.unit_id);
    L.push(`### ${path.length ? path.join(" › ") : "단원 미지정"} · ${q.ord}번`);
    L.push(``);
    L.push(`- 상태: ${flags.join(" · ")}`);
    const meta = [
      q.topic && `주제: ${q.topic}`,
      q.difficulty && `난이도: ${difficultyLabel(q.difficulty) ?? q.difficulty}`,
      q.trap_types?.length && `함정: ${q.trap_types.map((t) => trapLabel(t)).join(", ")}`,
    ].filter(Boolean);
    if (meta.length) L.push(`- ${meta.join(" · ")}`);
    L.push(`- 문제: ${oneLine(q.prompt)}`);
    for (const c of [...q.choices].sort((a, b) => a.ord - b.ord)) {
      const picks = r.wrongPicks[c.ord];
      const mark = c.ord === q.correct_choice ? "정답" : picks ? `오답으로 ${picks}회 고름` : "";
      L.push(`  - ${c.ord}) ${oneLine(c.text)}${mark ? `  ← ${mark}` : ""}`);
    }
    const expl = q.explanation ?? q.choices.find((c) => c.ord === q.correct_choice)?.explanation;
    if (expl) L.push(`- 해설: ${oneLine(expl).slice(0, 400)}`);
    if (q.source_quote) L.push(`- 근거: ${oneLine(q.source_quote).slice(0, 200)}`);
    if (r.note) L.push(`- 내 메모: ${oneLine(r.note).slice(0, 300)}`);
    L.push(``);
  }
  return { json, markdown: L.join("\n") };
}

/** 파일 이름: mcquiz_<주제>_saved_<날짜>.<ext> */
export function exportFileBase(subjectName: string, exportedAt: string): string {
  const safe = subjectName.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "");
  return `mcquiz_${safe}_saved_${exportedAt.slice(0, 10)}`;
}
