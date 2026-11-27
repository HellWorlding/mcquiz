import { describe, expect, it } from "vitest";
import { buildSavedExport, exportFileBase, unitPathOf, type ExportQuestion, type ExportRecord } from "./export";

const units = [
  { id: "top", no: null, title: "작업형 3유형 통계 검정", parent_id: null },
  { id: "leaf", no: null, title: "핵심 개념 정리", parent_id: "top" },
  { id: "k1", no: 1, title: "학교 경영", parent_id: null },
];

const q = (over: Partial<ExportQuestion> = {}): ExportQuestion => ({
  id: "q1",
  unit_id: "leaf",
  ord: 3,
  prompt: "귀무가설은?\n(두 줄)",
  correct_choice: 1,
  topic: "가설",
  difficulty: "easy",
  trap_types: ["scope_change"],
  tags: [],
  explanation: "H0 는 같다.",
  hint: null,
  source_quote: null,
  source_page: null,
  choices: [
    { ord: 1, text: "평균 = 70", explanation: null },
    { ord: 2, text: "평균 ≠ 70", explanation: null },
  ],
  ...over,
});
const r = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  attempts: 3,
  wrong: 2,
  confused: 1,
  last: false,
  lastAt: "2026-11-26T12:00:00Z",
  wrongPicks: { 2: 2 },
  avgSec: 41,
  saved: false,
  note: "다시 보기",
  ...over,
});

describe("unitPathOf", () => {
  it("최상위부터 말단까지, 번호 없는 제목은 그대로", () => {
    expect(unitPathOf(units, "leaf")).toEqual(["작업형 3유형 통계 검정", "핵심 개념 정리"]);
  });
  it("번호가 있으면 N강 식으로", () => {
    expect(unitPathOf(units, "k1")).toEqual(["1강 - 학교 경영"]);
  });
  it("모르는 단원은 빈 경로", () => {
    expect(unitPathOf(units, null)).toEqual([]);
  });
});

describe("buildSavedExport", () => {
  const out = buildSavedExport({
    subjectName: "빅데이터분석기사 실기",
    exportedAt: "2026-11-27T01:02:03Z",
    filterLabel: "틀림",
    units,
    rows: [
      { q: q(), r: r() },
      { q: q({ id: "q2", ord: 1, prompt: "두 번째", unit_id: "k1" }), r: r({ wrong: 0, confused: 0, saved: true, wrongPicks: {}, note: null }) },
    ],
  });
  const json = out.json as { format: string; count: number; questions: Record<string, unknown>[] };

  it("JSON 은 문제 파일 형식 + my_record, 많이 틀린 순", () => {
    expect(json.format).toBe("mcquiz-saved-export");
    expect(json.count).toBe(2);
    const first = json.questions[0];
    expect(first.prompt).toBe("귀무가설은?\n(두 줄)");
    expect(first.unit_path).toEqual(["작업형 3유형 통계 검정", "핵심 개념 정리"]);
    expect(first.correct_choice).toBe(1);
    expect(first.my_record).toMatchObject({ wrong_count: 2, last_result: "wrong", saved_by_me: false, note: "다시 보기" });
    expect((first.my_record as { wrong_picks: { ord: number; text: string; count: number }[] }).wrong_picks).toEqual([{ ord: 2, text: "평균 ≠ 70", count: 2 }]);
    expect(json.questions[1].my_record).toMatchObject({ wrong_count: 0, saved_by_me: true, last_result: "wrong" });
  });

  it("Markdown 에 머리말·요약·문항·정답 표시·오답 선택이 들어간다", () => {
    const md = out.markdown;
    expect(md).toContain("# 저장함 내보내기: 빅데이터분석기사 실기");
    expect(md).toContain("## 이 자료로 해 주었으면 하는 것");
    expect(md).toContain("2회 이상 틀림 1개");
    expect(md).toContain("### 작업형 3유형 통계 검정 › 핵심 개념 정리 · 3번");
    expect(md).toContain("- 문제: 귀무가설은? (두 줄)");
    expect(md).toContain("1) 평균 = 70  ← 정답");
    expect(md).toContain("2) 평균 ≠ 70  ← 오답으로 2회 고름");
    expect(md).toContain("- 내 메모: 다시 보기");
    expect(md).toContain("조건: 틀림.");
    expect(md).not.toContain("undefined");
  });

  it("파일 이름은 주제와 날짜로", () => {
    expect(exportFileBase("English - Oxford Word Skills", "2026-11-27T01:02:03Z")).toBe("mcquiz_English_-_Oxford_Word_Skills_saved_2026-11-27");
  });
});
