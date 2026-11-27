import { describe, expect, it } from "vitest";
import { fakeDeps, makeQuestion, stat, user } from "./fakes.test-util";
import { dismiss, markSaved, savedBox, savedBoxIds, savedBoxSummary, savedIdsFor, undismiss } from "./saved-box";
import { listNotes, notesFor, saveNote } from "./notes";

const qs = ["q1", "q2", "q3", "q4"].map((id) => makeQuestion(id));

describe("저장함 표시", () => {
  it("게스트는 거부", async () => {
    const { deps } = fakeDeps(null);
    expect((await markSaved(deps, "q1", true)).ok).toBe(false);
    expect((await dismiss(deps, ["q1"])).ok).toBe(false);
    expect((await undismiss(deps, ["q1"])).ok).toBe(false);
    expect(await savedIdsFor(deps, ["q1"])).toEqual([]);
  });
  it("저장·취소, 빼기·되돌리기 (중복 제거, 빈 목록은 0)", async () => {
    const { deps, st } = fakeDeps(user);
    await markSaved(deps, "q1", true);
    expect(await savedIdsFor(deps, ["q1", "q2"])).toEqual(["q1"]);
    await markSaved(deps, "q1", false);
    expect(await savedIdsFor(deps, ["q1"])).toEqual([]);
    expect(await dismiss(deps, ["q1", "q1", "q2"])).toEqual({ ok: true, data: 2 });
    expect(st.marks.filter((m) => m.kind === "dismissed")).toHaveLength(2);
    expect(await dismiss(deps, [])).toEqual({ ok: true, data: 0 });
    expect(await undismiss(deps, ["q1"])).toEqual({ ok: true, data: 1 });
    expect(st.marks.filter((m) => m.kind === "dismissed").map((m) => m.questionId)).toEqual(["q2"]);
  });
});

describe("savedBox / savedBoxIds", () => {
  const stats = [stat("q1", { attemptCount: 2, wrongCount: 2, wrongAfter: true }), stat("q2", { attemptCount: 1, lastCorrect: true }), stat("q3", { saved: true })];
  it("weak: 많이 틀린 순, 본문·집계·메모", async () => {
    const { deps } = fakeDeps(user, { questions: qs, stats, notes: [{ userId: "u1", questionId: "q3", content: "메모", updatedAt: "t" }] });
    const rows = await savedBox(deps, "S", "weak");
    expect(rows.map((r) => r.question.id)).toEqual(["q1", "q3"]);
    expect(rows[1].note).toBe("메모");
    expect(rows[0].stat.wrongCount).toBe(2);
  });
  it("all 은 과목 전체(안 푼 문항은 빈 집계), unsolved 는 안 푼 것만", async () => {
    const { deps } = fakeDeps(user, { questions: qs, stats });
    const all = await savedBox(deps, "S", "all");
    expect(all.map((r) => r.question.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(all[3].stat.attemptCount).toBe(0);
    expect((await savedBoxIds(deps, "S", "unsolved")).ids).toEqual(["q3", "q4"]); // 직접 저장만 한 q3 도 안 푼 문항
  });
  it("unitId 로 범위를 좁힌다", async () => {
    const { deps } = fakeDeps(user, { questions: qs.map((q) => (q.id === "q1" ? { ...q, unit_id: "unitB" } : q)), stats });
    expect((await savedBoxIds(deps, "S", "weak", { unitId: "unitA" })).ids).toEqual(["q3"]);
    expect((await savedBoxIds(deps, "S", "all", { unitId: "unitB" })).ids).toEqual(["q1"]);
  });
  it("게스트는 빈 목록·null 요약", async () => {
    const { deps } = fakeDeps(null, { questions: qs, stats });
    expect(await savedBox(deps, "S", "weak")).toEqual([]);
    expect(await savedBoxSummary(deps, "S")).toBeNull();
  });
  it("요약", async () => {
    const { deps } = fakeDeps(user, { questions: qs, stats });
    const s = await savedBoxSummary(deps, "S");
    expect(s?.items.map((i) => i.questionId)).toEqual(["q1", "q3"]);
    expect(s?.bySet[0].label).toBe("세트 1");
  });
});

describe("메모", () => {
  it("게스트는 guest, 저장/삭제", async () => {
    expect(await saveNote(fakeDeps(null).deps, "q1", "x")).toEqual({ ok: true, data: "guest" });
    const { deps } = fakeDeps(user, { questions: qs });
    expect(await saveNote(deps, "q1", "  내용 ")).toEqual({ ok: true, data: "saved" });
    expect(await notesFor(deps, ["q1"])).toEqual(new Map([["q1", "내용"]]));
    expect(await saveNote(deps, "q1", "   ")).toEqual({ ok: true, data: "deleted" });
    expect(await notesFor(deps, ["q1"])).toEqual(new Map());
  });
  it("listNotes: 과목으로 거르고 단원 라벨·번호 라벨을 붙인다", async () => {
    const { deps } = fakeDeps(user, {
      questions: [...qs, makeQuestion("z9", { subject_id: "T", unit_id: null })],
      units: [{ id: "unitA", parent_id: null, no: 1, title: "학교 경영", sort: 0, priority: null }],
    });
    await saveNote(deps, "q2", "둘");
    await saveNote(deps, "z9", "다른 과목");
    const mine = await listNotes(deps, "S");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ questionId: "q2", unitLabel: "1강 - 학교 경영", noLabel: "1강 2번", correctText: "가", groupId: null });
    expect((await listNotes(deps, null)).map((n) => n.questionId).sort()).toEqual(["q2", "z9"]);
    expect((await listNotes(deps, null)).find((n) => n.questionId === "z9")?.unitLabel).toBe("단원 없음");
  });
});
