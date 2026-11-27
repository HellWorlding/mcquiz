import type { Choice } from "./types";

export type FailedQuestion = { index: number; prompt: string; reason: string };

export type QuestionDraft = {
  prompt: string;
  choices: { text: string; explanation: string | null }[];
  /** 정답 선지 번호 (1부터) */
  correct: number | null;
  explanation?: string | null;
  hint?: string | null;
};

/**
 * C1. 선지는 4개 또는 5개, 빈 선지 없음, 정답은 1..n 또는 null(검토 필요).
 * 통과하면 다듬은 값을, 실패하면 이유 목록을 돌려준다.
 */
export function validateQuestion<T extends QuestionDraft>(q: T): { ok: true; value: T } | { ok: false; reasons: string[] } {
  const prompt = q.prompt.trim();
  const choices = q.choices.map((c) => ({ text: c.text.trim(), explanation: c.explanation?.trim() || null }));
  const reasons: string[] = [];
  if (!prompt) reasons.push("질문이 비어 있음");
  if (choices.length !== 4 && choices.length !== 5) reasons.push(`선지가 ${choices.length}개 (4개 또는 5개여야 함)`);
  if (choices.some((c) => !c.text || c.text === "(선지 없음)")) reasons.push("빈 선지가 있음");
  if (q.correct !== null && (q.correct < 1 || q.correct > choices.length)) reasons.push(`정답 번호 ${q.correct} 가 선지 범위를 벗어남`);
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, value: { ...q, prompt, choices, explanation: q.explanation?.trim() || null, hint: q.hint?.trim() || null } };
}

/** 저장 전 검증. 통과한 문항과 실패 목록을 나눈다. */
export function validateQuestions<T extends QuestionDraft>(questions: T[]): { valid: T[]; failed: FailedQuestion[] } {
  const valid: T[] = [];
  const failed: FailedQuestion[] = [];
  questions.forEach((q, index) => {
    const r = validateQuestion(q);
    if (r.ok) valid.push(r.value);
    else failed.push({ index, prompt: q.prompt.trim() || "(질문 없음)", reason: r.reasons.join(", ") });
  });
  return { valid, failed };
}

/** 선지 ord 가 1..n 연속인지 (DB 에서 읽은 선지 검사용) */
export function choicesAreSequential(choices: Pick<Choice, "ord">[]): boolean {
  return choices.every((c, i) => c.ord === i + 1);
}

/** 선지를 ord 순으로 정렬한다. 해설은 선지 객체에 붙어 있으므로 함께 움직인다 (C2) */
export function sortChoices<T extends Pick<Choice, "ord">>(choices: T[]): T[] {
  return [...choices].sort((a, b) => a.ord - b.ord);
}
