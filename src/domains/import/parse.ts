import { looksLikeJson, parseJsonQuestions } from "./parse-json";
import { mergeAnswerKey, parseQuestionText } from "./parse-text";
import type { ParseResult } from "./types";

/** 형식을 자동 감지해 파싱한다. 규칙 파서가 실패하고 OpenAI 키가 있으면 AI 파싱으로 넘어간다. */
export async function parseAny(
  text: string,
  answerText: string | null,
  opts: { allowAI?: boolean } = {},
): Promise<ParseResult> {
  let result: ParseResult;
  if (looksLikeJson(text)) {
    result = parseJsonQuestions(text);
  } else {
    result = parseQuestionText(text);
  }
  if (result.questions.length === 0 && opts.allowAI !== false) {
    try {
      const { aiParseQuestions } = await import("./ai");
      const ai = await aiParseQuestions(text);
      if (ai && ai.questions.length) result = ai;
    } catch (e) {
      result.warnings.push(`AI 파싱 실패: ${(e as Error).message}`);
    }
  }
  if (answerText?.trim() && result.questions.length) {
    const m = mergeAnswerKey(result.questions, answerText);
    result.warnings.push(...m.warnings);
    if (m.merged === 0) result.warnings.push("정답지에서 정답을 하나도 찾지 못했습니다. 번호 형식을 확인하세요.");
  }
  return result;
}
