import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import type { Unit } from "@/domains/shared/types";
import { hasOpenAI } from "@/domains/shared/env";
import { tokenize } from "./tokenize";
import { LOW_CONFIDENCE, type ParsedQuestion } from "./types";

type Db = SupabaseClient<Database>;

export type UnitAssignment = {
  unitId: string | null;
  confidence: number | null;
  candidates: { unitId: string; score: number }[];
  method: "hint" | "keyword" | "ai" | "none";
};

export { LOW_CONFIDENCE };

/** 단원 번호 힌트로 단원을 찾는다. 상위 단원을 우선하고, 같은 번호가 여럿이면 preferParent 아래를 우선한다. */
export function findUnitByNo(units: Unit[], no: number, preferParent: string | null = null): Unit | null {
  const hits = units.filter((u) => u.no === no);
  if (hits.length === 0) return null;
  if (preferParent) {
    const under = hits.find((u) => u.parent_id === preferParent);
    if (under) return under;
  }
  return hits.find((u) => u.parent_id === null) ?? hits[0];
}

export function confidenceFromScores(scores: number[]): number {
  if (scores.length === 0 || scores[0] <= 0) return 0;
  if (scores.length === 1) return Math.min(1, scores[0] / 3);
  const ratio = scores[0] / (scores[0] + scores[1]); // 0.5 ~ 1
  const margin = (ratio - 0.5) * 2; // 0 ~ 1
  const strength = Math.min(1, scores[0] / 3);
  return Math.round(Math.min(1, 0.7 * margin + 0.3 * strength) * 100) / 100;
}

/**
 * 문항 하나를 단원에 배정한다.
 * 1) 원문 단원 표시 → 2) Postgres 키워드 매칭(classify_unit) → 3) OpenAI (키가 있고 신뢰도가 낮을 때)
 */
export async function classifyQuestion(
  db: Db,
  subjectId: string,
  units: Unit[],
  q: ParsedQuestion,
  opts: { preferParent?: string | null; useAI?: boolean } = {},
): Promise<UnitAssignment> {
  if (units.length === 0) return { unitId: null, confidence: null, candidates: [], method: "none" };

  if (q.unitHint !== null) {
    const u = findUnitByNo(units, q.unitHint, opts.preferParent ?? null);
    if (u) return { unitId: u.id, confidence: 1, candidates: [{ unitId: u.id, score: 1 }], method: "hint" };
  }

  const text = [q.prompt, ...q.choices.map((c) => c.text)].join(" ");
  const tokens = tokenize(text);
  let candidates: { unitId: string; score: number }[] = [];
  if (tokens.length > 0) {
    const { data, error } = await db.rpc("classify_unit", { p_subject: subjectId, p_tokens: tokens });
    if (!error && data) {
      candidates = data.map((r) => ({ unitId: r.unit_id, score: Number(r.score) }));
    }
  }
  // 상위 단원이 지정됐으면 그 하위 단원만 후보로 둔다
  if (opts.preferParent) {
    const allowed = new Set(descendantIds(units, opts.preferParent));
    candidates = candidates.filter((c) => allowed.has(c.unitId));
  }
  const confidence = confidenceFromScores(candidates.map((c) => c.score));
  if (candidates.length > 0 && confidence >= LOW_CONFIDENCE) {
    return { unitId: candidates[0].unitId, confidence, candidates, method: "keyword" };
  }

  if ((opts.useAI ?? true) && hasOpenAI()) {
    try {
      const { aiClassifyUnit } = await import("./ai");
      const pool = candidates.length ? candidates.slice(0, 3).map((c) => c.unitId) : [];
      const ai = await aiClassifyUnit(db, subjectId, units, q, pool);
      if (ai) return { unitId: ai.unitId, confidence: ai.confidence, candidates, method: "ai" };
    } catch (e) {
      // AI 는 보조 수단이다. 키 오류·네트워크 오류가 나도 키워드 결과로 계속 간다.
      console.warn("[classify] OpenAI 호출 실패, 키워드 결과 사용:", (e as Error).message);
    }
  }

  return {
    unitId: candidates[0]?.unitId ?? null,
    confidence: candidates.length ? confidence : null,
    candidates,
    method: candidates.length ? "keyword" : "none",
  };
}

export function descendantIds(units: Unit[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) {
    for (const u of units) if (u.parent_id === out[i]) out.push(u.id);
  }
  return out;
}
