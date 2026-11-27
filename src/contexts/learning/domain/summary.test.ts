import { describe, expect, it } from "vitest";
import { emptyStat } from "./saved-box";
import { buildLearningSummary } from "./summary";
import type { ExportQuestion } from "./export";

const units = [
  { id: "u1", no: 1, title: "학교 경영", parent_id: null },
  { id: "u2", no: 2, title: "교무 행정", parent_id: null },
];
const q = (id: string, unit: string, ord: number): ExportQuestion => ({
  id,
  unit_id: unit,
  ord,
  prompt: `문제 ${id}`,
  correct_choice: 1,
  topic: "주제A",
  difficulty: "hard",
  trap_types: ["reversal"],
  tags: [],
  explanation: null,
  hint: null,
  source_quote: null,
  source_page: null,
  choices: [
    { ord: 1, text: "가", explanation: null },
    { ord: 2, text: "나", explanation: null },
  ],
});

describe("buildLearningSummary", () => {
  const stats = [
    { ...emptyStat("a", { unitId: "u1", topic: "주제A", difficulty: "hard", trapTypes: ["reversal"] }), attemptCount: 3, wrongCount: 2, lastCorrect: false, wrongAfter: true },
    { ...emptyStat("b", { unitId: "u2", topic: "주제B", difficulty: "easy" }), attemptCount: 1, wrongCount: 0, lastCorrect: true },
  ];
  const md = buildLearningSummary({
    subjectName: "교직실무",
    exportedAt: "2026-11-28T00:00:00Z",
    units,
    scopeQuestionCount: 10,
    stats,
    weakTotal: 1,
    rows: [{ q: q("a", "u1", 3), r: { attempts: 3, wrong: 2, confused: 0, last: false, lastAt: null, wrongPicks: { 2: 2 }, avgSec: null, saved: false, note: null } }],
  });
  it("머리말과 전체 요약", () => {
    expect(md).toContain("# 학습 기록 분석 자료: 교직실무");
    expect(md).toContain("## 이 자료로 해 주었으면 하는 것");
    expect(md).toContain("문항 10개 중 2개를 풀었고, 안 푼 문항 8개. 채점 4회 중 오답 2회 (오답률 50%). 최근 풀이 기준 정답 1/2.");
    expect(md).toContain("약한 문항(틀림·헷갈림·직접 저장) 1개. 이 중 2회 이상 틀림 1개.");
  });
  it("집계 표: 단원별·세부 주제별(오답만)·난이도별·함정 유형별", () => {
    expect(md).toContain("## 단원별");
    expect(md).toContain("| 1강 - 학교 경영 | 1 | 3 | 2 | 67% | 0 |");
    expect(md).toContain("| 2강 - 교무 행정 | 1 | 1 | 0 | 0% | 0 |");
    expect(md).toContain("## 세부 주제별 (오답 있는 것만)");
    expect(md).toContain("| 주제A |");
    expect(md).not.toContain("| 주제B |");
    expect(md).toContain("| 상 | 1 | 3 | 2 | 67% | 0 |");
    expect(md).toContain("| 순서·관계 뒤집기 |");
  });
  it("약한 문항은 저장함 내보내기와 같은 서식", () => {
    expect(md).toContain("## 약한 문항 (1개, 많이 틀린 순)");
    expect(md).toContain("### 1강 - 학교 경영 · 3번");
    expect(md).toContain("- 상태: 2회 틀림 / 3회 풀이 · 최근 오답");
    expect(md).toContain("2) 나  ← 오답으로 2회 고름");
    expect(md).not.toContain("undefined");
  });
  it("단원 범위면 제목에 단원을 붙이고 top 으로 잘렸으면 알린다", () => {
    const m2 = buildLearningSummary({ subjectName: "S", exportedAt: "2026-11-28T00:00:00Z", units, scopeQuestionCount: 1, stats: [], weakTotal: 5, rows: [], unitTitle: "1강 - 학교 경영" });
    expect(m2).toContain("# 학습 기록 분석 자료: S › 1강 - 학교 경영");
    expect(m2).toContain("아래에는 많이 틀린 순으로 0개만 실었습니다.");
  });
});
