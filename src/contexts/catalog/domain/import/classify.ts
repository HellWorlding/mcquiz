import { tokenize } from "@/shared/tokenize";
import type { ParsedQuestion } from "./types";

export type UnitCandidate = { unitId: string; score: number };

export type UnitAssignment = {
  unitId: string | null;
  confidence: number | null;
  candidates: UnitCandidate[];
  method: "hint" | "keyword" | "ai" | "none";
};

/** 후보 점수 → 0~1 신뢰도. 1위와 2위의 차이(70%)와 1위의 세기(30%) */
export function confidenceFromScores(scores: number[]): number {
  if (scores.length === 0 || scores[0] <= 0) return 0;
  if (scores.length === 1) return Math.min(1, scores[0] / 3);
  const ratio = scores[0] / (scores[0] + scores[1]); // 0.5 ~ 1
  const margin = (ratio - 0.5) * 2; // 0 ~ 1
  const strength = Math.min(1, scores[0] / 3);
  return Math.round(Math.min(1, 0.7 * margin + 0.3 * strength) * 100) / 100;
}

/** 문항 본문(질문 + 선지)을 분류용 토큰으로 */
export function questionTokens(q: Pick<ParsedQuestion, "prompt" | "choices">): string[] {
  return tokenize([q.prompt, ...q.choices.map((c) => c.text)].join(" "));
}

/** 후보를 allowed 집합으로 거른다 (상위 단원이 지정됐을 때) */
export function restrictCandidates(candidates: UnitCandidate[], allowed: Set<string> | null): UnitCandidate[] {
  return allowed ? candidates.filter((c) => allowed.has(c.unitId)) : candidates;
}
