/**
 * 학습 요약(LearningSummary) Markdown: 출제·분석용. 옛 scripts/export-learning.ts 와 MCP get_learning_summary 를 하나로.
 * 머리말 → 전체 요약 → 단원·주제·난이도·함정별 표 → 약한 문항(많이 틀린 순, 저장함 내보내기와 같은 문항 서식).
 */
import { difficultyLabel, trapLabel } from "@/shared/labels";
import { fmtKstDate, questionMarkdownLines, sortExportRows, unitPathOf, type ExportRow, type ExportUnit } from "./export";
import type { QuestionStat } from "./types";

export type LearningSummaryInput = {
  subjectName: string;
  exportedAt: string;
  units: ExportUnit[];
  /** 범위(과목 또는 단원 아래) 안의 모든 문항 수 */
  scopeQuestionCount: number;
  /** 범위 안 문항의 집계 (풀었거나 표시한 것만 들어 있다) */
  stats: QuestionStat[];
  /** 약한 문항 전체 개수 (top 으로 자르기 전) */
  weakTotal: number;
  /** 실제로 실은 약한 문항 (많이 틀린 순, top 개) */
  rows: ExportRow[];
  unitTitle?: string | null;
};

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

type Cell = { n: number; graded: number; wrong: number; confused: number };

function groupTable(title: string, stats: readonly QuestionStat[], keyOf: (s: QuestionStat) => string[], label: (k: string) => string, onlyWrong = false): string[] {
  const m = new Map<string, Cell>();
  for (const s of stats) {
    for (const k of keyOf(s)) {
      const c = m.get(k) ?? { n: 0, graded: 0, wrong: 0, confused: 0 };
      c.n++;
      c.graded += s.attemptCount;
      c.wrong += s.wrongCount;
      c.confused += s.confusedAfter ? 1 : 0;
      m.set(k, c);
    }
  }
  const entries = [...m.entries()].filter(([, c]) => c.graded > 0 && (!onlyWrong || c.wrong > 0));
  if (!entries.length) return [];
  const L = [`## ${title}`, ``, `| 구분 | 문항 | 채점 | 오답 | 오답률 | 헷갈림 |`, `|---|---:|---:|---:|---:|---:|`];
  for (const [k, c] of entries.sort((a, b) => b[1].wrong / Math.max(1, b[1].graded) - a[1].wrong / Math.max(1, a[1].graded)))
    L.push(`| ${label(k)} | ${c.n} | ${c.graded} | ${c.wrong} | ${pct(c.wrong, c.graded)} | ${c.confused} |`);
  L.push(``);
  return L;
}

export function buildLearningSummary(input: LearningSummaryInput): string {
  const { subjectName, exportedAt, units, stats, scopeQuestionCount, weakTotal, unitTitle } = input;
  const rows = sortExportRows(input.rows);
  const graded = stats.filter((s) => s.attemptCount > 0);
  const totalGraded = graded.reduce((s, a) => s + a.attemptCount, 0);
  const totalWrong = graded.reduce((s, a) => s + a.wrongCount, 0);
  const lastCorrect = graded.filter((s) => s.lastCorrect).length;
  const unitName = (id: string) => (id === "__none__" ? "단원 미지정" : unitPathOf(units, id).join(" › ") || "단원 미지정");

  const L: string[] = [];
  L.push(`# 학습 기록 분석 자료: ${subjectName}${unitTitle ? ` › ${unitTitle}` : ""}`);
  L.push(``);
  L.push(`기준일 ${fmtKstDate(exportedAt)} (KST). 한 학습자의 퀴즈 풀이 기록입니다.`);
  L.push(``);
  L.push(`## 이 자료로 해 주었으면 하는 것`);
  L.push(``);
  L.push(`1. 아래 "약한 문항" 의 공통점을 찾아 주세요: 자주 틀리는 단원·세부 주제, 함정 유형, 오답으로 고른 선지의 패턴(어떤 개념을 서로 바꿔 알고 있는지).`);
  L.push(`2. 그 분석을 바탕으로 다음 출제에서 비중을 높일 주제와 문제 유형을 제안해 주세요. 같은 문항을 다시 내지 말고, 같은 개념을 다른 각도(정의·비교·적용·계산)로 묻는 새 문항을 만들어 주세요.`);
  L.push(`3. 새 문항은 get_authoring_guide 의 JSON 형식으로, 해설에 선지 번호를 쓰지 마세요.`);
  L.push(``);
  L.push(`## 전체 요약`);
  L.push(``);
  L.push(`- 문항 ${scopeQuestionCount}개 중 ${graded.length}개를 풀었고, 안 푼 문항 ${Math.max(0, scopeQuestionCount - graded.length)}개. 채점 ${totalGraded}회 중 오답 ${totalWrong}회 (오답률 ${pct(totalWrong, totalGraded)}). 최근 풀이 기준 정답 ${lastCorrect}/${graded.length}.`);
  L.push(
    `- 약한 문항(틀림·헷갈림·직접 저장) ${weakTotal}개. 이 중 2회 이상 틀림 ${stats.filter((s) => (s.wrongAfter || s.confusedAfter || s.saved) && s.wrongCount >= 2).length}개.${rows.length < weakTotal ? ` 아래에는 많이 틀린 순으로 ${rows.length}개만 실었습니다.` : ""}`,
  );
  L.push(``);
  L.push(...groupTable("단원별", stats, (s) => [s.unitId ?? "__none__"], unitName));
  L.push(...groupTable("세부 주제별 (오답 있는 것만)", stats, (s) => (s.topic ? [s.topic] : []), (k) => k, true));
  L.push(...groupTable("난이도별", stats, (s) => (s.difficulty ? [s.difficulty] : []), (k) => difficultyLabel(k) ?? k));
  L.push(...groupTable("함정 유형별", stats, (s) => s.trapTypes ?? [], (k) => trapLabel(k)));
  L.push(`## 약한 문항 (${rows.length}개, 많이 틀린 순)`);
  L.push(``);
  for (const row of rows) L.push(...questionMarkdownLines(units, row));
  return L.join("\n");
}
