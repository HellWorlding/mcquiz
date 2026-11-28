import type { Attempt, QuestionStat } from "./types";

/**
 * 원래 문항 번호: "단원번호.문항번호" (예: 1.12). 단원이 없거나 단원 번호가 없으면 문항 번호만.
 * 단원 번호는 문항이 속한 단원 자신의 no 다 (상위 단원 번호가 아니다).
 */
export function questionNumberLabel(unitNo: number | null | undefined, ord: number): string {
  return unitNo == null ? String(ord) : `${unitNo}.${ord}`;
}

/** 문항 id → 번호 라벨. units 는 unit_id → no */
export function questionNumbers(questions: readonly { id: string; unit_id: string | null; ord: number }[], unitNos: ReadonlyMap<string, number | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) out[q.id] = questionNumberLabel(q.unit_id ? unitNos.get(q.unit_id) : null, q.ord);
  return out;
}

/**
 * 화면에 보이는 표시: 빼기(dismissed)가 저장·헷갈림을 덮는다.
 * 밑의 값(saved·confused)은 그대로 두므로 빼기를 되돌리면 원래 표시가 돌아온다.
 */
export function visibleMarks(saved: boolean, confused: boolean, dismissed: boolean): { saved: boolean; confused: boolean } {
  return dismissed ? { saved: false, confused: false } : { saved, confused };
}

type AnswerLike = { selectedOrd: number | null } | undefined;
const isAnswered = (a: AnswerLike) => a != null && a.selectedOrd != null;

/** 아직 답을 고르지 않은 문항 수 (헷갈림만 누른 문항도 미응답) */
export function unansweredCount(questionIds: readonly string[], answers: Readonly<Record<string, AnswerLike>>): number {
  return questionIds.filter((id) => !isAnswered(answers[id])).length;
}

/** 첫 미응답 문항의 위치. 다 풀었으면 -1 */
export function firstUnansweredIndex(questionIds: readonly string[], answers: Readonly<Record<string, AnswerLike>>): number {
  return questionIds.findIndex((id) => !isAnswered(answers[id]));
}

/**
 * 새 퀴즈를 열 때 헷갈림을 켠 채로 시작할 문항.
 * 마지막 빼기 이후 헷갈림 표시가 있고(confusedAfter), 가장 최근 풀이도 헷갈림이면 이어진다.
 * 최근 풀이에서 헷갈림을 껐으면(다시 끄기) 이어지지 않는다.
 * attempts 는 created_at 오름차순.
 */
export function carriedConfusedIds(stats: readonly Pick<QuestionStat, "questionId" | "confusedAfter">[], attempts: readonly Pick<Attempt, "questionId" | "confused">[]): string[] {
  const last = new Map<string, boolean>();
  for (const a of attempts) last.set(a.questionId, a.confused);
  return stats.filter((s) => s.confusedAfter && last.get(s.questionId) === true).map((s) => s.questionId);
}
