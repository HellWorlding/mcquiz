import { describe, expect, it } from "vitest";
import { fakeDeps, makeQuestion, stat, user } from "./fakes.test-util";
import { exportSavedBox, learningSummary } from "./export";

const qs = ["q1", "q2", "q3"].map((id) => makeQuestion(id));
const now = "2026-11-28T00:00:00.000Z";

describe("exportSavedBox", () => {
  it("게스트·빈 목록·모르는 과목은 err", async () => {
    expect((await exportSavedBox(fakeDeps(null).deps, { subjectId: "S", questionIds: ["q1"], filterLabel: null })).ok).toBe(false);
    const { deps } = fakeDeps(user, { questions: qs });
    expect((await exportSavedBox(deps, { subjectId: "S", questionIds: [], filterLabel: null })).ok).toBe(false);
    expect((await exportSavedBox(deps, { subjectId: "nope", questionIds: ["q1"], filterLabel: null })).ok).toBe(false);
  });
  it("JSON v2 + Markdown, 풀이 기록에서 오답 선지·메모·저장을 모은다", async () => {
    const { deps } = fakeDeps(user, {
      questions: qs,
      now,
      attempts: [
        { id: "a1", questionId: "q1", selectedOrd: 2, isCorrect: false, confused: false, elapsedSec: 20, createdAt: "2026-01-01" } as never,
        { id: "a2", questionId: "q1", selectedOrd: 1, isCorrect: true, confused: true, elapsedSec: 40, createdAt: "2026-01-02" } as never,
      ].map((a) => ({ ...(a as object), userId: "u1" }) as never),
      marks: [{ userId: "u1", questionId: "q2", kind: "saved", at: now }],
      notes: [{ userId: "u1", questionId: "q1", content: "메모", updatedAt: now }],
    });
    const r = await exportSavedBox(deps, { subjectId: "S", questionIds: ["q2", "q1"], filterLabel: "틀림" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.count).toBe(2);
    expect(r.data.fileBase).toBe("mcquiz_과목_S_saved_2026-11-28");
    const json = JSON.parse(r.data.json);
    expect(json.version).toBe(2);
    expect(json.questions[0].no).toBe(1); // 많이 틀린 순: q1 먼저
    expect(json.questions[0].my_record).toMatchObject({ attempts: 2, wrong_count: 1, confused_count: 1, last_result: "correct", avg_seconds: 30, note: "메모", wrong_picks: [{ ord: 2, text: "나", count: 1 }] });
    expect(json.questions[1].my_record.saved_by_me).toBe(true);
    expect(r.data.markdown).toContain("조건: 틀림.");
  });
});

describe("learningSummary", () => {
  it("약한 문항을 많이 틀린 순으로 top 개, 범위 요약", async () => {
    const stats = [stat("q1", { attemptCount: 2, wrongCount: 2, lastCorrect: false, wrongAfter: true, topic: "A" }), stat("q2", { attemptCount: 1, wrongCount: 1, wrongAfter: true }), stat("q3", { attemptCount: 1, lastCorrect: true })];
    const { deps } = fakeDeps(user, { questions: qs, stats, now });
    const r = await learningSummary(deps, "S", null, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toContain("# 학습 기록 분석 자료: 과목 S");
    expect(r.data).toContain("문항 3개 중 3개를 풀었고, 안 푼 문항 0개. 채점 4회 중 오답 3회 (오답률 75%). 최근 풀이 기준 정답 1/3.");
    expect(r.data).toContain("약한 문항(틀림·헷갈림·직접 저장) 2개. 이 중 2회 이상 틀림 1개. 아래에는 많이 틀린 순으로 1개만 실었습니다.");
    expect(r.data).toContain("### 1강 - 학교 경영 · 1번");
    expect(r.data).not.toContain("· 2번");
  });
  it("단원 범위와 게스트", async () => {
    const { deps } = fakeDeps(user, { questions: qs.map((q) => (q.id === "q3" ? { ...q, unit_id: "unitB" } : q)), stats: [stat("q3", { attemptCount: 1, wrongCount: 1, wrongAfter: true, unitId: "unitB" })], now });
    const r = await learningSummary(deps, "S", "unitA");
    expect(r.ok && r.data).toContain("문항 2개 중 0개를 풀었고");
    expect((await learningSummary(fakeDeps(null).deps, "S")).ok).toBe(false);
  });
});
