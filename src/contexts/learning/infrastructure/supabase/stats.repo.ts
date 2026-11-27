import type { Db } from "@/shared/db/types";
import type { StatsReadModel } from "../../application/ports";

/** learning 스키마의 SQL 함수(읽기 모델). RLS 가 적용된 클라이언트로 호출한다 */
/** userId 는 service role(CLI) 에서만 효력이 있다 (learning.effective_user). 세션에서는 DB 가 auth.uid() 를 쓴다 */
export function statsReadModel(db: Db, userId: string | null = null): StatsReadModel {
  const s = () => db.schema("learning");
  const u = userId && /^[0-9a-f-]{36}$/i.test(userId) ? { p_user: userId } : {};
  return {
    async questionStats(subjectId) {
      const { data, error } = await s().rpc("question_stats", { p_subject: subjectId, ...u });
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((r) => !!r.question_id)
        .map((r) => ({
          questionId: r.question_id,
          unitId: r.unit_id ?? null,
          setId: r.set_id ?? null,
          tags: r.tags ?? [],
          topic: r.topic ?? null,
          difficulty: r.difficulty ?? null,
          trapTypes: r.trap_types ?? [],
          attemptCount: Number(r.attempt_count ?? 0),
          wrongCount: Number(r.wrong_count ?? 0),
          lastCorrect: r.last_correct ?? null,
          lastGradedAt: r.last_graded_at ?? null,
          wrongAfter: !!r.wrong_after,
          confusedAfter: !!r.confused_after,
          saved: !!r.saved,
          lastWeakAt: r.last_weak_at ?? null,
        }));
    },
    async unsolvedQuestions(subjectId) {
      const { data, error } = await s().rpc("unsolved_questions", { p_subject: subjectId, ...u });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id, unitId: r.unit_id ?? null, setId: r.set_id ?? null, tags: r.tags ?? [] }));
    },
    async unitProgress(subjectId) {
      const { data, error } = await s().rpc("unit_progress", { p_subject: subjectId, ...u });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ sessionId: r.session_id, unitId: r.unit_id ?? null, covered: Number(r.covered), answered: Number(r.answered) }));
    },
    async unitAttemptCounts(subjectId) {
      const { data, error } = await s().rpc("unit_attempt_counts", { p_subject: subjectId, ...u });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ unitId: r.unit_id ?? null, attempts: Number(r.attempts), n: Number(r.n), nCorrect: Number(r.n_correct) }));
    },
    async unitRoundScores(subjectId) {
      const { data, error } = await s().rpc("unit_round_scores", { p_subject: subjectId, ...u });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ unitId: r.unit_id ?? null, roundNo: Number(r.round_no), n: Number(r.n), nCorrect: Number(r.n_correct) }));
    },
    async subjectActivity() {
      const { data, error } = await s().rpc("subject_activity", { ...u });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ subjectId: r.subject_id, weakCount: Number(r.weak_count), attemptCount: Number(r.attempt_count), lastAt: r.last_at ?? null }));
    },
  };
}
