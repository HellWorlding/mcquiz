import { err, ok, type Result } from "@/shared/result";
import { emptyStat, savedBoxFilter, summarizeSavedBox } from "../domain/saved-box";
import type { LearningFilter, QuestionStat, QuizQuestion, SavedBoxSummary } from "../domain/types";
import type { LearningDeps } from "./ports";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const LOGIN = "로그인이 필요합니다.";
const uniq = (ids: string[], max: number) => [...new Set(ids)].slice(0, max);

/** 직접 저장 / 저장 취소. 저장하면 SQL 집계에서 빼기(dismissed)보다 나중이라 다시 저장함에 든다 (L4) */
export async function markSaved(deps: LearningDeps, questionId: string, on: boolean): Promise<Result<void>> {
  if (!deps.user) return err(LOGIN);
  try {
    if (on) await deps.marks.upsert(deps.user.id, [questionId], "saved", deps.clock.now());
    else await deps.marks.remove(deps.user.id, [questionId], "saved");
    return ok(undefined);
  } catch (e) {
    return err(msg(e));
  }
}

/** 저장함에서 빼기 (기록은 유지). 이후에 다시 틀리거나 저장하면 다시 들어온다 */
export async function dismiss(deps: LearningDeps, questionIds: string[]): Promise<Result<number>> {
  if (!deps.user) return err(LOGIN);
  const ids = uniq(questionIds, 500);
  if (ids.length === 0) return ok(0);
  try {
    await deps.marks.upsert(deps.user.id, ids, "dismissed", deps.clock.now());
    return ok(ids.length);
  } catch (e) {
    return err(msg(e));
  }
}

/** 방금 뺀 문항 되돌리기 (dismissed 표시 삭제) */
export async function undismiss(deps: LearningDeps, questionIds: string[]): Promise<Result<number>> {
  if (!deps.user) return err(LOGIN);
  const ids = uniq(questionIds, 500);
  if (ids.length === 0) return ok(0);
  try {
    await deps.marks.remove(deps.user.id, ids, "dismissed");
    return ok(ids.length);
  } catch (e) {
    return err(msg(e));
  }
}

/** 주어진 문항 중 내가 직접 저장한 것 (풀이 화면 저장 버튼 초기 상태) */
/** 퀴즈를 열 때 보이는 "저장됨": 저장 표시가 빼기보다 나중인 문항만 (question_stats.saved). 게스트·과목 없음이면 빈 목록 */
export async function visibleSavedIds(deps: LearningDeps, subjectId: string | null, questionIds: string[]): Promise<string[]> {
  if (!deps.user || !subjectId || questionIds.length === 0) return [];
  try {
    const ids = new Set(questionIds);
    const stats = await deps.stats.questionStats(subjectId);
    return stats.filter((s) => s.saved && ids.has(s.questionId)).map((s) => s.questionId);
  } catch {
    return [];
  }
}

export async function savedIdsFor(deps: LearningDeps, questionIds: string[]): Promise<string[]> {
  if (!deps.user || questionIds.length === 0) return [];
  return deps.marks.listMarked(deps.user.id, questionIds, "saved");
}

export type SavedBoxOptions = { /** 이 단원(하위 포함)만 */ unitId?: string | null };

/**
 * 저장함 문항 id (필터 적용, 많이 틀린 순). all/unsolved 는 과목 전체 색인이 필요하므로 Catalog 에서 받는다.
 * 본문 없이 id 만 돌려주므로 호출자가 쪽을 나눈 뒤 savedBoxQuestions 로 본문을 받는다.
 */
export async function savedBoxIds(deps: LearningDeps, subjectId: string, filter: LearningFilter, opts: SavedBoxOptions = {}): Promise<{ ids: string[]; statById: Map<string, QuestionStat> }> {
  const statById = new Map<string, QuestionStat>();
  if (!deps.user) return { ids: [], statById };
  const stats = await deps.stats.questionStats(subjectId);
  for (const s of stats) statById.set(s.questionId, s);
  const scope = opts.unitId ? new Set(await deps.catalog.questionIds({ kind: "units", subjectId, unitIds: [opts.unitId] })) : null;
  const inScope = (id: string) => !scope || scope.has(id);
  let ids: string[];
  if (filter === "all") {
    ids = scope ? [...scope] : await deps.catalog.questionIds({ kind: "subject", subjectId });
    ids.sort((a, b) => (statById.get(b)?.wrongCount ?? 0) - (statById.get(a)?.wrongCount ?? 0));
  } else if (filter === "unsolved") {
    ids = (await deps.stats.unsolvedQuestions(subjectId)).map((u) => u.id).filter(inScope);
  } else {
    ids = savedBoxFilter(stats, filter)
      .map((s) => s.questionId)
      .filter(inScope);
  }
  return { ids, statById };
}

export type SavedBoxRow = { question: QuizQuestion; stat: QuestionStat; note: string | null };

/** 저장함 목록 (본문 + 집계 + 메모). 많이 틀린 순 */
export async function savedBox(deps: LearningDeps, subjectId: string, filter: LearningFilter, opts: SavedBoxOptions = {}): Promise<SavedBoxRow[]> {
  if (!deps.user) return [];
  const { ids, statById } = await savedBoxIds(deps, subjectId, filter, opts);
  return savedBoxQuestions(deps, ids, statById);
}

/** id 목록 → 저장함 행 (ids 순서) */
export async function savedBoxQuestions(deps: LearningDeps, ids: string[], statById: Map<string, QuestionStat>): Promise<SavedBoxRow[]> {
  if (!deps.user || ids.length === 0) return [];
  const [questions, notes] = await Promise.all([deps.catalog.questionsByIds(ids), deps.notes.forQuestions(deps.user.id, ids)]);
  return questions.map((q) => ({
    question: q,
    stat: statById.get(q.id) ?? emptyStat(q.id, { unitId: q.unit_id, setId: q.set_id, tags: q.tags, topic: q.topic, difficulty: q.difficulty, trapTypes: q.trap_types }),
    note: notes.get(q.id) ?? null,
  }));
}

/** 저장함 화면 요약 (옛 getWeakSummary). 게스트는 null */
export async function savedBoxSummary(deps: LearningDeps, subjectId: string): Promise<SavedBoxSummary | null> {
  if (!deps.user) return null;
  const [stats, units, sets] = await Promise.all([deps.stats.questionStats(subjectId), deps.catalog.listUnits(subjectId), deps.catalog.listSets(subjectId)]);
  return summarizeSavedBox(stats, units, sets);
}
