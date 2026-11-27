/**
 * 과목의 AI 답변 방식. 자료(스크립트·책)를 올린 과목은 자료에 있는 내용만 근거로 답하고(grounded),
 * 자료가 없는 과목은 AI 의 일반 지식으로 자유롭게 답한다(open).
 */
export type AiMode = "grounded" | "open";

export function aiModeFor(sourceCount: number): AiMode {
  return sourceCount > 0 ? "grounded" : "open";
}
