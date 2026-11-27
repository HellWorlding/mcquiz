import { toUnitAttemptCounts, toUnitRoundScores } from "../domain/round-scores";
import type { QuestionStat, RoundScore, SubjectActivity, UnitAttemptCount, UnitAttemptCounts, UnitProgressRow, UnitRoundScores } from "../domain/types";
import type { LearningDeps } from "./ports";

/** 사용자×문항 집계. 게스트는 빈 목록 */
export async function questionStats(deps: LearningDeps, subjectId: string): Promise<QuestionStat[]> {
  if (!deps.user) return [];
  return deps.stats.questionStats(subjectId);
}

/** 문항별 풀이 횟수 (퀴즈 범위 "N회 미만" 필터용) */
export async function attemptCounts(deps: LearningDeps, subjectId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of await questionStats(deps, subjectId)) out[s.questionId] = s.attemptCount;
  return out;
}

export async function unitRoundScores(deps: LearningDeps, subjectId: string): Promise<RoundScore[]> {
  if (!deps.user) return [];
  return deps.stats.unitRoundScores(subjectId);
}

/** 화면용: unit_id → 회독 k → { n, correct } */
export async function unitRoundScoreMap(deps: LearningDeps, subjectId: string): Promise<UnitRoundScores> {
  return toUnitRoundScores(await unitRoundScores(deps, subjectId));
}

export async function unitAttemptCounts(deps: LearningDeps, subjectId: string): Promise<UnitAttemptCount[]> {
  if (!deps.user) return [];
  return deps.stats.unitAttemptCounts(subjectId);
}

/** 화면용: unit_id → 풀이 횟수 k → { n, correct } (옛 UnitRounds) */
export async function unitAttemptCountMap(deps: LearningDeps, subjectId: string): Promise<UnitAttemptCounts> {
  return toUnitAttemptCounts(await unitAttemptCounts(deps, subjectId));
}

export async function unitProgress(deps: LearningDeps, subjectId: string): Promise<UnitProgressRow[]> {
  if (!deps.user) return [];
  return deps.stats.unitProgress(subjectId);
}

/** 과목별 내 활동 (시작 화면 정렬용) */
export async function subjectActivity(deps: LearningDeps): Promise<SubjectActivity[]> {
  if (!deps.user) return [];
  return deps.stats.subjectActivity();
}
