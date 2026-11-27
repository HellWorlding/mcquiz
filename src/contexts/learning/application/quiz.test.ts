import { describe, expect, it } from "vitest";
import { fakeDeps, makeQuestion, stat, user } from "./fakes.test-util";
import { assembleQuiz, deleteSession, listUnfinishedSessions, recordAttempt, resolveQuizIds, saveProgress, scopeTitle, toggleConfused } from "./quiz";

const qs = ["q1", "q2", "q3", "q4", "q5", "q6"].map((id) => makeQuestion(id, { difficulty: id === "q2" || id === "q5" ? "hard" : "medium" }));

describe("assembleQuiz (옛 resolveQuiz)", () => {
  it("범위 → 순서대로 offset/count", async () => {
    const { deps } = fakeDeps(user, { questions: qs });
    const r = await resolveQuizIds(deps, { scope: { kind: "subject", subjectId: "S" }, filter: "all", order: { kind: "seq", offset: 2 }, count: 3 });
    expect(r).toEqual({ ok: true, data: { ids: ["q3", "q4", "q5"], total: 6 } });
  });
  it("무작위는 seed 로 결정적", async () => {
    const { deps } = fakeDeps(user, { questions: qs });
    const a = await assembleQuiz(deps, { scope: { kind: "subject", subjectId: "S" }, filter: "all", order: { kind: "random", seed: 3 }, count: 4 });
    const b = await assembleQuiz(deps, { scope: { kind: "subject", subjectId: "S" }, filter: "all", order: { kind: "random", seed: 3 }, count: 4 });
    expect(a).toEqual(b);
    expect(a.ok && a.data.length).toBe(4);
  });
  it("ids 범위는 그대로 (중복 제거); 게스트도 된다", async () => {
    const { deps } = fakeDeps(null, { questions: qs });
    const r = await assembleQuiz(deps, { scope: { kind: "ids", ids: ["q3", "q1", "q3"] }, filter: "all", order: { kind: "seq", offset: 0 }, count: "all" });
    expect(r).toEqual({ ok: true, data: ["q3", "q1"] });
  });
  it("필터 wrong 은 저장함 순서(많이 틀린 순)로, 범위 안의 것만", async () => {
    const stats = [stat("q1", { attemptCount: 2, wrongCount: 1, wrongAfter: true }), stat("q4", { attemptCount: 3, wrongCount: 3, wrongAfter: true }), stat("q6", { attemptCount: 1, wrongCount: 1, wrongAfter: true, unitId: "other" })];
    const { deps } = fakeDeps(user, { questions: qs.map((q) => (q.id === "q6" ? { ...q, unit_id: "other" } : q)), stats });
    const r = await assembleQuiz(deps, { scope: { kind: "units", subjectId: "S", unitIds: ["unitA"] }, filter: "wrong", order: { kind: "seq", offset: 0 }, count: "all" });
    expect(r).toEqual({ ok: true, data: ["q4", "q1"] });
  });
  it("필터가 있으면 게스트는 빈 목록", async () => {
    const { deps } = fakeDeps(null, { questions: qs });
    expect(await assembleQuiz(deps, { scope: { kind: "subject", subjectId: "S" }, filter: "weak", order: { kind: "seq", offset: 0 }, count: "all" })).toEqual({ ok: true, data: [] });
  });
  it("unsolved 는 안 푼 문항만", async () => {
    const { deps } = fakeDeps(user, { questions: qs, stats: [stat("q1", { attemptCount: 1 }), stat("q2", { attemptCount: 2 })] });
    const r = await assembleQuiz(deps, { scope: { kind: "subject", subjectId: "S" }, filter: "unsolved", order: { kind: "seq", offset: 0 }, count: "all" });
    expect(r).toEqual({ ok: true, data: ["q3", "q4", "q5", "q6"] });
  });
  it("난이도·N회 미만 필터는 순서·개수보다 먼저", async () => {
    const { deps } = fakeDeps(user, { questions: qs, stats: [stat("q2", { attemptCount: 2 }), stat("q5", { attemptCount: 1 })] });
    const r = await resolveQuizIds(deps, { scope: { kind: "subject", subjectId: "S" }, filter: "all", order: { kind: "seq", offset: 0 }, count: 10, difficulty: "hard", under: 2 });
    expect(r).toEqual({ ok: true, data: { ids: ["q5"], total: 1 } });
  });
  it("L5 약점 섞어 풀기: 저장함에서 count 개, 모자라면 그대로 (안 푼 문항으로 채우지 않음)", async () => {
    const stats = [stat("q1", { attemptCount: 1, wrongCount: 1, wrongAfter: true }), stat("q3", { saved: true })];
    const { deps } = fakeDeps(user, { questions: qs, stats });
    const r = await assembleQuiz(deps, { scope: { kind: "subject", subjectId: "S" }, filter: "weak", weakMix: true, order: { kind: "random", seed: 1 }, count: 20 });
    expect(r.ok && [...r.data].sort()).toEqual(["q1", "q3"]);
  });
  it("단원 제목", async () => {
    const { deps } = fakeDeps(user, { units: [{ id: "unitA", parent_id: null, no: 3, title: "학교 경영", sort: 0, priority: null }, { id: "unitB", parent_id: null, no: 4, title: "교무", sort: 1, priority: null }] });
    expect(await scopeTitle(deps, { kind: "units", subjectId: "S", unitIds: ["unitA"] }, "단원")).toBe("3강 - 학교 경영");
    expect(await scopeTitle(deps, { kind: "units", subjectId: "S", unitIds: ["unitB", "unitA"] }, "단원")).toBe("3강 - 학교 경영 외 1개");
    expect(await scopeTitle(deps, { kind: "set", setId: "x" }, "세트")).toBe("세트");
  });
});

describe("풀이 기록·진행 상태", () => {
  it("L2 게스트는 저장하지 않고 ok(null)", async () => {
    const { deps, st } = fakeDeps(null);
    expect(await recordAttempt(deps, { questionId: "q1", selectedOrd: 1, isCorrect: true, confused: false })).toEqual({ ok: true, data: null });
    expect(await saveProgress(deps, { sessionId: null, subjectId: "S", title: "t", questionIds: ["q1"], position: 0, answers: {}, finished: false })).toEqual({ ok: true, data: null });
    expect(st.attempts).toHaveLength(0);
    expect(st.sessions).toHaveLength(0);
  });
  it("L1 풀이는 추가 전용, elapsedSec 은 0..3600; confused 토글만 바뀐다", async () => {
    const { deps, st } = fakeDeps(user);
    const r = await recordAttempt(deps, { questionId: "q1", selectedOrd: 2, isCorrect: false, confused: false, elapsedSec: 99999 });
    expect(r.ok).toBe(true);
    expect(st.attempts[0]).toMatchObject({ questionId: "q1", selectedOrd: 2, isCorrect: false, elapsedSec: 3600 });
    await toggleConfused(deps, st.attempts[0].id, true);
    expect(st.attempts[0].confused).toBe(true);
    expect(st.attempts).toHaveLength(1);
  });
  it("saveProgress: 새 세션은 id 를 만들고, 있으면 갱신. L7 finished 는 목록에서 빠진다", async () => {
    const { deps, st } = fakeDeps(user);
    const r = await saveProgress(deps, { sessionId: null, subjectId: "S", title: "단원", questionIds: ["q1", "q2"], position: 0, answers: {}, finished: false });
    expect(r.ok && r.data).toBe("ses1");
    const r2 = await saveProgress(deps, { sessionId: null, subjectId: "S", title: "다른", questionIds: ["q3"], position: 0, answers: {}, finished: false });
    expect(r2.ok && r2.data).toBe("ses2");
    expect((await listUnfinishedSessions(deps, "S")).map((s) => s.id).sort()).toEqual(["ses1", "ses2"]);
    await saveProgress(deps, { sessionId: "ses1", subjectId: "S", title: "단원", questionIds: ["q1", "q2"], position: 1, answers: { q1: { selectedOrd: 1, isCorrect: true, confused: false } }, finished: true });
    expect(st.sessions.find((s) => s.id === "ses1")?.finished).toBe(true);
    expect((await listUnfinishedSessions(deps, "S")).map((s) => s.id)).toEqual(["ses2"]);
    await deleteSession(deps, "ses2");
    expect(await listUnfinishedSessions(deps, "S")).toEqual([]);
  });
  it("다른 사용자의 세션은 갱신하지 못한다 (err)", async () => {
    const { deps } = fakeDeps(user, { sessions: [{ id: "x", userId: "someone", subjectId: "S", title: "", questionIds: [], position: 0, answers: {}, finished: false, updatedAt: "" }] });
    const r = await saveProgress(deps, { sessionId: "x", subjectId: "S", title: "", questionIds: [], position: 0, answers: {}, finished: false });
    expect(r.ok).toBe(false);
  });
});
