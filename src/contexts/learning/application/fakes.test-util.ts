/** 테스트용 인메모리 포트 (vitest 전용. 런타임 코드에서 import 하지 않는다) */
import type { CurrentUser } from "@/contexts/access";
import { emptyStat } from "../domain/saved-box";
import { roundScores } from "../domain/round-scores";
import type { Attempt, LearningUnit, MarkKind, QuestionStat, QuizQuestion, QuizSession } from "../domain/types";
import type { LearningDeps, SessionRow } from "./ports";

export const user: CurrentUser = { id: "u1", email: "u@x", displayName: null, isAdmin: false, aiLimit: null };

export const makeQuestion = (id: string, over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id,
  subject_id: "S",
  unit_id: "unitA",
  set_id: "set1",
  ord: Number(id.replace(/\D/g, "")) || 1,
  prompt: `문제 ${id}`,
  correct_choice: 1,
  explanation: null,
  hint: null,
  topic: null,
  difficulty: "medium",
  trap_types: [],
  tags: [],
  points: null,
  needs_review: false,
  source_quote: null,
  source_page: null,
  choices: [
    { ord: 1, text: "가", explanation: null },
    { ord: 2, text: "나", explanation: null },
    { ord: 3, text: "다", explanation: null },
    { ord: 4, text: "라", explanation: null },
  ],
  ...over,
});

export type FakeState = {
  questions: QuizQuestion[];
  units: LearningUnit[];
  attempts: Attempt[];
  marks: { userId: string; questionId: string; kind: MarkKind; at: string }[];
  notes: { userId: string; questionId: string; content: string; updatedAt: string }[];
  sessions: QuizSession[];
  /** question_stats 를 흉내 내는 집계 (SQL 대신 테스트가 직접 지정) */
  stats: QuestionStat[];
  now: string;
  seed: number;
};

export function fakeDeps(current: CurrentUser | null, init: Partial<FakeState> = {}) {
  const st: FakeState = {
    questions: init.questions ?? [],
    units: init.units ?? [{ id: "unitA", parent_id: null, no: 1, title: "학교 경영", sort: 0, priority: null }],
    attempts: init.attempts ?? [],
    marks: init.marks ?? [],
    notes: init.notes ?? [],
    sessions: init.sessions ?? [],
    stats: init.stats ?? [],
    now: init.now ?? "2026-11-28T00:00:00.000Z",
    seed: init.seed ?? 7,
  };
  let seq = 0;
  const byId = new Map(st.questions.map((q) => [q.id, q]));
  const deps: LearningDeps = {
    user: current,
    attempts: {
      async add(a) {
        const id = `att${++seq}`;
        st.attempts.push({ id, ...a, createdAt: st.now });
        return id;
      },
      async setConfused(id, userId, confused) {
        const a = st.attempts.find((x) => x.id === id && (x as Attempt & { userId?: string }).userId === userId);
        if (a) a.confused = confused;
      },
      async listForQuestions(userId, ids) {
        return st.attempts.filter((a) => (a as Attempt & { userId?: string }).userId === userId && ids.includes(a.questionId));
      },
    },
    sessions: {
      async get(id) {
        return st.sessions.find((s) => s.id === id && s.userId === current?.id) ?? null;
      },
      async listUnfinished(subjectId, limit) {
        return st.sessions
          .filter((s) => s.userId === current?.id && s.subjectId === subjectId && !s.finished)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, limit)
          .map((s) => ({ id: s.id, title: s.title, position: s.position, total: s.questionIds.length, updatedAt: s.updatedAt }));
      },
      async insert(userId, row: SessionRow) {
        const id = `ses${++seq}`;
        st.sessions.push({ id, userId, ...row, answers: row.answers as QuizSession["answers"] });
        return id;
      },
      async update(id, userId, row) {
        const i = st.sessions.findIndex((s) => s.id === id && s.userId === userId);
        if (i < 0) throw new Error("no session");
        st.sessions[i] = { ...st.sessions[i], ...row, answers: row.answers as QuizSession["answers"] };
      },
      async delete(id, userId) {
        st.sessions = st.sessions.filter((s) => !(s.id === id && s.userId === userId));
      },
    },
    marks: {
      async upsert(userId, ids, kind, at) {
        for (const questionId of ids) {
          const m = st.marks.find((x) => x.userId === userId && x.questionId === questionId && x.kind === kind);
          if (m) m.at = at;
          else st.marks.push({ userId, questionId, kind, at });
        }
      },
      async remove(userId, ids, kind) {
        st.marks = st.marks.filter((m) => !(m.userId === userId && m.kind === kind && ids.includes(m.questionId)));
      },
      async listMarked(userId, ids, kind) {
        return st.marks.filter((m) => m.userId === userId && m.kind === kind && ids.includes(m.questionId)).map((m) => m.questionId);
      },
    },
    notes: {
      async upsert(userId, questionId, content, at) {
        const n = st.notes.find((x) => x.userId === userId && x.questionId === questionId);
        if (n) Object.assign(n, { content, updatedAt: at });
        else st.notes.push({ userId, questionId, content, updatedAt: at });
      },
      async remove(userId, questionId) {
        st.notes = st.notes.filter((n) => !(n.userId === userId && n.questionId === questionId));
      },
      async forQuestions(userId, ids) {
        return new Map(st.notes.filter((n) => n.userId === userId && ids.includes(n.questionId)).map((n) => [n.questionId, n.content]));
      },
      async listAll(userId) {
        return st.notes.filter((n) => n.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
    },
    stats: {
      async questionStats() {
        return st.stats;
      },
      async unsolvedQuestions() {
        const solved = new Set(st.stats.filter((s) => s.attemptCount > 0).map((s) => s.questionId));
        return st.questions.filter((q) => !solved.has(q.id)).map((q) => ({ id: q.id, unitId: q.unit_id, setId: q.set_id, tags: q.tags }));
      },
      async unitProgress() {
        return [];
      },
      async unitAttemptCounts() {
        return [];
      },
      async unitRoundScores() {
        return roundScores(st.attempts.map((a) => ({ ...a, unitId: byId.get(a.questionId)?.unit_id ?? null })));
      },
      async subjectActivity() {
        return [];
      },
    },
    catalog: {
      async questionsByIds(ids) {
        return ids.map((id) => byId.get(id)).filter((q): q is QuizQuestion => !!q);
      },
      async questionIds(scope) {
        if (scope.kind === "subject") return st.questions.filter((q) => q.subject_id === scope.subjectId).map((q) => q.id);
        if (scope.kind === "units") return st.questions.filter((q) => q.subject_id === scope.subjectId && q.unit_id && scope.unitIds.includes(q.unit_id)).map((q) => q.id);
        if (scope.kind === "set") return st.questions.filter((q) => q.set_id === scope.setId).map((q) => q.id);
        return [];
      },
      async listUnits() {
        return st.units;
      },
      async listSets() {
        return [{ id: "set1", title: "세트 1" }];
      },
      async getSubject(id) {
        return id === "S" ? { id, name: "과목 S" } : null;
      },
    },
    clock: { now: () => st.now },
    rng: { seed: () => st.seed },
  };
  return { deps, st };
}

export const stat = (id: string, over: Partial<QuestionStat> = {}): QuestionStat => ({ ...emptyStat(id, { unitId: "unitA", setId: "set1" }), ...over });
