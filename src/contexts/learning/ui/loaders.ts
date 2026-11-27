import "server-only";
import { cookies } from "next/headers";
import { difficultyLabel, unitPathLabel } from "@/shared/labels";
import { hashString } from "../domain/shuffle";
import { pickWeakMix } from "../domain/weak-mix";
import { capForGuest, GUEST_TRIAL_COOKIE, GUEST_TRIAL_LIMIT, isTrialUsed } from "../domain/guest";
import type { Subject } from "@/contexts/catalog";
import { parseQuizParams, type QuizSearchParams } from "../domain/quiz";
import type { LearningUnit, NoteItem, QuizQuestion, ResumeState, SavedBoxSummary, SubjectActivity, UnfinishedSession, UnitAttemptCounts, UnitProgressRow, UnitRoundScores } from "../domain/types";
import { sessionCatalogApi, sessionLearningDeps } from "../infrastructure/session-deps";
import { getSession, listUnfinishedSessions as listUnfinished, resolveQuizIds, scopeTitle } from "../application/quiz";
import { savedBoxIds, savedBoxSummary as summary, savedIdsFor } from "../application/saved-box";
import { listNotes, notesFor } from "../application/notes";
import { attemptCounts, subjectActivity as activity, unitAttemptCountMap, unitProgress as progress, unitRoundScoreMap } from "../application/stats";

export type { QuizSearchParams };

export type ResolvedQuiz = {
  questions: QuizQuestion[];
  /** 게스트 체험: 오늘 이미 체험해 잠김 */
  guestLocked: boolean;
  /** 게스트면 체험 문항 수, 로그인은 null */
  guestLimit: number | null;
  /** 순서·개수 적용 전 문항 수 */
  total: number;
  title: string;
  subjectId: string | null;
  /** 선지 셔플 seed (렌더 밖에서 만든다) */
  seed: number;
  /** 이어서 풀기일 때 저장된 진행 상태 */
  resume: ResumeState | null;
  /** 내 메모 (question_id → content) */
  notes: Record<string, string>;
  /** 이미 저장함에 직접 넣어 둔 문항 */
  savedIds: string[];
  /** unit_id → "3강 - 학교 경영" 같은 단원 라벨 */
  unitLabels: Record<string, string>;
};

const TITLE: Record<ReturnType<typeof parseQuizParams>["titleKind"], string> = {
  quiz: "퀴즈",
  retry: "다시 풀기",
  weakmix: "약점 섞어 풀기",
  wrong: "틀린 문제 다시 풀기",
  confused: "헷갈린 문제 다시 풀기",
  saved: "저장된 문제 풀기",
  set: "세트",
  collection: "묶음",
  units: "단원",
  subject: "전체",
};

/** 퀴즈 페이지: 주소 → 문항 목록 + 제목 + 이어서 풀기 + 메모·저장 상태 (옛 resolveQuiz + 페이지 조회) */
export async function loadQuiz(params: QuizSearchParams): Promise<ResolvedQuiz> {
  const deps = await sessionLearningDeps();
  const seed = deps.rng.seed();
  const p = parseQuizParams(params, seed);
  const isGuest = !deps.user;
  // 게스트는 하루 한 번만 체험 (쿠키). 잠겼으면 문항 없이 안내 카드
  if (isGuest && isTrialUsed((await cookies()).get(GUEST_TRIAL_COOKIE)?.value, new Date(deps.clock.now()))) {
    return { questions: [], total: 0, title: TITLE.quiz, subjectId: p.subjectId ?? null, seed, resume: null, notes: {}, savedIds: [], unitLabels: {}, guestLocked: true, guestLimit: GUEST_TRIAL_LIMIT };
  }
  let questions: QuizQuestion[] = [];
  let total = 0;
  let title = TITLE.quiz;
  let resume: ResumeState | null = null;
  let resolvedSeed = seed;

  const ses = p.sessionId ? await getSession(deps, p.sessionId) : null;
  if (ses) {
    questions = await deps.catalog.questionsByIds(ses.questionIds);
    total = questions.length;
    title = ses.title;
    resolvedSeed = hashString(ses.id) & 0xffff; // 같은 세션은 같은 선지 순서
    resume = { id: ses.id, position: Math.min(ses.position, Math.max(0, questions.length - 1)), answers: ses.answers ?? {} };
  } else if (p.scope) {
    const r = await resolveQuizIds(deps, { scope: p.scope, filter: p.filter, order: p.order, count: p.count, weakMix: p.weakMix, difficulty: p.difficulty, under: p.under });
    const ids = capForGuest(r.ok ? r.data.ids : [], !deps.user);
    total = r.ok ? r.data.total : 0;
    title = await scopeTitle(deps, p.scope, TITLE[p.titleKind]);
    if (p.difficulty) title += ` · 난이도 ${difficultyLabel(p.difficulty) ?? p.difficulty}`;
    if (p.under) title += ` · ${p.under}회 미만`;
    questions = await deps.catalog.questionsByIds(ids);
  }

  const ids = questions.map((q) => q.id);
  const subjectId = p.subjectId ?? questions[0]?.subject_id ?? null;
  const [notes, savedIds, units] = await Promise.all([notesFor(deps, ids), savedIdsFor(deps, ids), subjectId ? deps.catalog.listUnits(subjectId) : Promise.resolve([] as LearningUnit[])]);
  const unitLabels: Record<string, string> = {};
  for (const q of questions) if (q.unit_id && !(q.unit_id in unitLabels)) unitLabels[q.unit_id] = unitPathLabel(units, q.unit_id) ?? "";
  return { questions, total, title, subjectId, seed: resolvedSeed, resume, notes: Object.fromEntries(notes), savedIds, unitLabels, guestLocked: false, guestLimit: isGuest ? GUEST_TRIAL_LIMIT : null };
}

/** 과목 목록을 활동순(저장함 많음 → 최근 풀이 → 만든 순)으로. 홈·저장함·메모·AI 질문 페이지가 같이 쓴다 */
export async function listSubjectsByActivity(): Promise<Subject[]> {
  const catalog = await sessionCatalogApi();
  const [list, activity] = await Promise.all([catalog.listSubjects(), subjectActivity()]);
  const act = new Map(activity.map((a) => [a.subjectId, a]));
  return [...list].sort((a, b) => {
    const x = act.get(a.id), y = act.get(b.id);
    return (y?.weakCount ?? 0) - (x?.weakCount ?? 0) || (y?.lastAt ?? "").localeCompare(x?.lastAt ?? "") || a.createdAt.localeCompare(b.createdAt);
  });
}

/** 과목 안에서 아직 끝내지 않은 내 퀴즈 (이어서 풀기 목록) */
export async function listUnfinishedSessions(subjectId: string): Promise<UnfinishedSession[]> {
  return listUnfinished(await sessionLearningDeps(), subjectId);
}

/** unit_id → 회독 k → { n, correct }. 비로그인은 빈 객체 */
export async function getUnitRoundScores(subjectId: string): Promise<UnitRoundScores> {
  return unitRoundScoreMap(await sessionLearningDeps(), subjectId);
}

/** unit_id → 풀이 횟수 k → { n, correct } (옛 getUnitRounds) */
export async function getUnitAttemptCounts(subjectId: string): Promise<UnitAttemptCounts> {
  return unitAttemptCountMap(await sessionLearningDeps(), subjectId);
}

/** 끝내지 않은 세션별·단원별 진행 */
export async function getUnitProgress(subjectId: string): Promise<UnitProgressRow[]> {
  return progress(await sessionLearningDeps(), subjectId);
}

/** 저장함 화면 요약 (옛 getWeakSummary). 게스트는 null */
export async function savedBoxSummary(subjectId: string): Promise<SavedBoxSummary | null> {
  return summary(await sessionLearningDeps(), subjectId);
}

/** 저장함 페이지에 필요한 것 한 번에: 요약 + 목록 문항 본문 + 단원 + 회독 점수 */
export async function loadSavedBox(subjectId: string): Promise<{ summary: SavedBoxSummary | null; questions: QuizQuestion[]; units: LearningUnit[]; roundScores: UnitRoundScores }> {
  const deps = await sessionLearningDeps();
  const [s, units, roundScores] = await Promise.all([summary(deps, subjectId), deps.catalog.listUnits(subjectId), unitRoundScoreMap(deps, subjectId)]);
  const questions = s ? await deps.catalog.questionsByIds(s.items.map((i) => i.questionId)) : [];
  return { summary: s, questions, units, roundScores };
}

/** 주어진 문항 중 내가 직접 저장한 것 */
export async function getSavedIdsFor(questionIds: string[]): Promise<string[]> {
  return savedIdsFor(await sessionLearningDeps(), questionIds);
}

/** 문항별 풀이 횟수 */
export async function getAttemptCounts(subjectId: string): Promise<Record<string, number>> {
  return attemptCounts(await sessionLearningDeps(), subjectId);
}

/** 약점 섞어 풀기 문항 id (D-007 옛 동작: 약한 영역 안 푼 문항 60% + 저장함 40%) */
export async function buildWeakMix(subjectId: string, n: number): Promise<string[]> {
  const deps = await sessionLearningDeps();
  if (!deps.user) return [];
  const [{ ids }, stats, unsolved] = await Promise.all([savedBoxIds(deps, subjectId, "weak"), deps.stats.questionStats(subjectId), deps.stats.unsolvedQuestions(subjectId)]);
  return pickWeakMix({ stats, unsolved, savedBoxIds: ids }, n, deps.rng.seed());
}

/** 주어진 문항들의 내 메모 (question_id → content) */
export async function getNotesFor(questionIds: string[]): Promise<Record<string, string>> {
  return Object.fromEntries(await notesFor(await sessionLearningDeps(), questionIds));
}

/** 내 메모 전체 (과목으로 거르기 가능) */
export async function listMyNotes(subjectId: string | null): Promise<NoteItem[]> {
  return listNotes(await sessionLearningDeps(), subjectId);
}

/** 과목별 내 활동 (시작 화면 정렬용) */
export async function subjectActivity(): Promise<SubjectActivity[]> {
  return activity(await sessionLearningDeps());
}
