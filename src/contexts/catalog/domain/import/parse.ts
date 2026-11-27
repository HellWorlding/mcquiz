import { looksLikeJson, parseJsonQuestions } from "./parse-json";
import { mergeAnswerKey, parseQuestionText } from "./parse-text";
import type { ParseResult } from "./types";

/** 형식을 자동 감지해 규칙 파서로 파싱한다 (순수). AI 보조는 application 의 parseWithFallback 이 맡는다 */
export function parseRules(text: string): ParseResult {
  return looksLikeJson(text) ? parseJsonQuestions(text) : parseQuestionText(text);
}

/** 정답지 텍스트를 병합하고 경고를 더한다 */
export function applyAnswerKey(result: ParseResult, answerText: string | null | undefined): ParseResult {
  if (answerText?.trim() && result.questions.length) {
    const m = mergeAnswerKey(result.questions, answerText);
    result.warnings.push(...m.warnings);
    if (m.merged === 0) result.warnings.push("정답지에서 정답을 하나도 찾지 못했습니다. 번호 형식을 확인하세요.");
  }
  return result;
}
