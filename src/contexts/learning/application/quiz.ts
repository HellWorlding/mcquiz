import { err, ok, type Result } from "@/shared/result";
import { unitLabel } from "@/shared/labels";
import { savedBoxFilter } from "../domain/saved-box";
import { pickWeakMix } from "../domain/weak-mix";
import { clampElapsed, pickByOrder } from "../domain/quiz";
import type { LearningFilter, QuizCount, QuizOrder, QuizScope, QuizSession, SessionAnswer, UnfinishedSession } from "../domain/types";
import type { LearningDeps } from "./ports";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type AssembleQuizInput = {
  scope: QuizScope;
  filter: LearningFilter;
  order: QuizOrder;
  count: QuizCount;
  /** 약점 섞어 풀기: 저장함에서 count 개 표본 (L5) */
  weakMix?: boolean;
  /** 난이도 하나로 거르기 */
  difficulty?: string | null;
  /** 풀이 횟수가 이 값 미만인 문항만 */
  under?: number | null;
};

/** 범위의 과목 id (필터·회수 제한에 집계가 필요할 때) */
function subjectOf(scope: QuizScope): string | null {
  return scope.kind === "subject" || scope.kind === "units" ? scope.subjectId : null;
}

/**
 * 퀴즈 조립: 범위 → 필터 → (난이도·회수) → 순서/offset → count.
 * 돌려주는 ids 는 Catalog 가 RLS 로 거른 결과다 (L6). total 은 순서·개수 적용 전 문항 수.
 */
export async function resolveQuizIds(deps: LearningDeps, input: AssembleQuizInput): Promise<Result<{ ids: string[]; total: number }>> {
  try {
    const { scope, filter } = input;
    let ids: string[] = scope.kind === "ids" ? [...new Set(scope.ids)] : await deps.catalog.questionIds(scope);
    const subjectId = subjectOf(scope);
    const needStats = filter !== "all" || (input.under ?? 0) > 0;
    const stats = needStats && subjectId && deps.user ? await deps.stats.questionStats(subjectId) : [];
    const statById = new Map(stats.map((s) => [s.questionId, s]));

    if (filter !== "all") {
      if (!deps.user) return ok({ ids: [], total: 0 });
      if (filter === "unsolved") {
        const set = new Set(ids);
        ids = subjectId ? (await deps.stats.unsolvedQuestions(subjectId)).map((u) => u.id).filter((id) => set.has(id)) : ids.filter((id) => (statById.get(id)?.attemptCount ?? 0) === 0);
      } else {
        // 저장함 순서(많이 틀린 순)를 따른다
        const inScope = new Set(ids);
        ids = savedBoxFilter(stats, filter)
          .map((s) => s.questionId)
          .filter((id) => inScope.has(id));
      }
    }
    if (input.difficulty && ids.length) {
      const qs = await deps.catalog.questionsByIds(ids);
      const keep = new Set(qs.filter((q) => q.difficulty === input.difficulty).map((q) => q.id));
      ids = ids.filter((id) => keep.has(id));
    }
    if ((input.under ?? 0) > 0 && ids.length && subjectId) {
      const under = input.under!;
      ids = ids.filter((id) => (statById.get(id)?.attemptCount ?? 0) < under);
    }
    const total = ids.length;
    if (input.weakMix) {
      const n = input.count === "all" ? 20 : input.count;
      const seed = input.order.kind === "random" ? input.order.seed : deps.rng.seed();
      // D-007: 옛 동작 — 약한 영역의 안 푼 문항 60% + 저장함 40%, 모자라면 채움
      const unsolved = subjectId ? await deps.stats.unsolvedQuestions(subjectId) : [];
      return ok({ ids: pickWeakMix({ stats: [...statById.values()], unsolved, savedBoxIds: ids }, n, seed), total });
    }
    return ok({ ids: pickByOrder(ids, input.order, input.count), total });
  } catch (e) {
    return err(msg(e));
  }
}

export async function assembleQuiz(deps: LearningDeps, input: AssembleQuizInput): Promise<Result<string[]>> {
  const r = await resolveQuizIds(deps, input);
  return r.ok ? ok(r.data.ids) : r;
}

/** 범위 제목: 단원이면 "3강 - 학교 경영" / "… 외 2개" */
export async function scopeTitle(deps: LearningDeps, scope: QuizScope, fallback: string): Promise<string> {
  if (scope.kind !== "units") return fallback;
  const units = await deps.catalog.listUnits(scope.subjectId);
  const picked = units.filter((u) => scope.unitIds.includes(u.id)).sort((a, b) => a.sort - b.sort || (a.no ?? 0) - (b.no ?? 0));
  if (!picked.length) return fallback;
  const first = unitLabel(picked[0].no, picked[0].title);
  return picked.length === 1 ? first : `${first} 외 ${picked.length - 1}개`;
}

export type RecordAttemptInput = {
  questionId: string;
  selectedOrd: number | null;
  isCorrect: boolean | null;
  confused: boolean;
  /** 이 문항에 쓴 시간(초). 0..3600 으로 자른다 */
  elapsedSec?: number | null;
};

/** L2. 답을 고르면 attempts 에 기록한다. 게스트는 저장하지 않고 null */
export async function recordAttempt(deps: LearningDeps, input: RecordAttemptInput): Promise<Result<string | null>> {
  if (!deps.user) return ok(null);
  try {
    const id = await deps.attempts.add({
      userId: deps.user.id,
      questionId: input.questionId,
      selectedOrd: input.selectedOrd,
      isCorrect: input.isCorrect,
      confused: input.confused,
      elapsedSec: clampElapsed(input.elapsedSec),
    });
    return ok(id);
  } catch (e) {
    return err(msg(e));
  }
}

/** L1. 풀이는 바꾸지 않는다 — 자기 풀이의 confused 토글만 예외 */
export async function toggleConfused(deps: LearningDeps, attemptId: string, confused: boolean): Promise<Result<void>> {
  if (!deps.user) return ok(undefined);
  try {
    await deps.attempts.setConfused(attemptId, deps.user.id, confused);
    return ok(undefined);
  } catch (e) {
    return err(msg(e));
  }
}

export type SaveProgressInput = {
  sessionId: string | null;
  subjectId: string | null;
  title: string;
  questionIds: string[];
  position: number;
  answers: Record<string, SessionAnswer>;
  finished: boolean;
};

/** 진행 상태 저장. sessionId 가 없으면 새로 만들고 id 를 돌려준다. 게스트는 저장하지 않는다 (L2) */
export async function saveProgress(deps: LearningDeps, input: SaveProgressInput): Promise<Result<string | null>> {
  if (!deps.user) return ok(null);
  try {
    const row = {
      subjectId: input.subjectId,
      title: input.title,
      questionIds: input.questionIds,
      position: input.position,
      answers: input.answers,
      finished: input.finished,
      updatedAt: deps.clock.now(),
    };
    if (input.sessionId) {
      await deps.sessions.update(input.sessionId, deps.user.id, row);
      return ok(input.sessionId);
    }
    return ok(await deps.sessions.insert(deps.user.id, row));
  } catch (e) {
    return err(msg(e));
  }
}

export async function deleteSession(deps: LearningDeps, sessionId: string): Promise<Result<void>> {
  if (!deps.user) return ok(undefined);
  try {
    await deps.sessions.delete(sessionId, deps.user.id);
    return ok(undefined);
  } catch (e) {
    return err(msg(e));
  }
}

/** L7. 끝내지 않은 내 퀴즈 (최근 10개) */
export async function listUnfinishedSessions(deps: LearningDeps, subjectId: string): Promise<UnfinishedSession[]> {
  if (!deps.user) return [];
  return deps.sessions.listUnfinished(subjectId, 10);
}

/** 이어서 풀기용 세션 (RLS 로 내 것만 보인다) */
export async function getSession(deps: LearningDeps, sessionId: string): Promise<QuizSession | null> {
  if (!deps.user) return null;
  return deps.sessions.get(sessionId);
}
