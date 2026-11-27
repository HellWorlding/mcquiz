import type { Attempt, RoundScore, UnitAttemptCounts, UnitRoundScores } from "./types";

export type RoundAttempt = Pick<Attempt, "id" | "questionId" | "selectedOrd" | "isCorrect" | "createdAt"> & { unitId: string | null };

/**
 * L3. k회독 점수: 각 문항의 k번째 채점 풀이(selectedOrd 가 있는 것)만 모아 단원별로 n / 정답 수.
 * 문항을 3번 푼 사용자는 1·2·3회독에 각각 1회 기여한다. SQL learning.unit_round_scores 와 같은 정의.
 */
export function roundScores(attempts: readonly RoundAttempt[]): RoundScore[] {
  const graded = attempts.filter((a) => a.selectedOrd !== null);
  const byQuestion = new Map<string, RoundAttempt[]>();
  for (const a of graded) {
    const list = byQuestion.get(a.questionId) ?? [];
    list.push(a);
    byQuestion.set(a.questionId, list);
  }
  const acc = new Map<string, RoundScore>();
  for (const list of byQuestion.values()) {
    list.sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id));
    list.forEach((a, i) => {
      const roundNo = i + 1;
      const key = `${a.unitId ?? ""}\u0000${roundNo}`;
      const cur = acc.get(key) ?? { unitId: a.unitId, roundNo, n: 0, nCorrect: 0 };
      cur.n++;
      if (a.isCorrect === true) cur.nCorrect++;
      acc.set(key, cur);
    });
  }
  return [...acc.values()].sort((a, b) => (a.unitId ?? "").localeCompare(b.unitId ?? "") || a.roundNo - b.roundNo);
}

/** RoundScore[] → 화면용 unit_id → 회독 → {n, correct} */
export function toUnitRoundScores(rows: readonly RoundScore[]): UnitRoundScores {
  const out: UnitRoundScores = {};
  for (const r of rows) (out[r.unitId ?? "__none__"] ??= {})[r.roundNo] = { n: r.n, correct: r.nCorrect };
  return out;
}

export function toUnitAttemptCounts(rows: readonly { unitId: string | null; attempts: number; n: number; nCorrect: number }[]): UnitAttemptCounts {
  const out: UnitAttemptCounts = {};
  for (const r of rows) (out[r.unitId ?? "__none__"] ??= {})[r.attempts] = { n: r.n, correct: r.nCorrect };
  return out;
}
