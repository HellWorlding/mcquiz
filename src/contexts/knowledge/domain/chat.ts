import type { AiMode } from "./ai-mode";
import type { SearchHit } from "./search";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatSource = { label: string; sourceId: string; chunkId: string; kind: string; page: number | null; snippet: string };
export type ChatLang = "ko" | "en";

/** 챗봇에 깔아 둘 문항 맥락 (선지는 학습자가 본 순서로 다시 번호를 매긴다) */
export type ChatQuestionContext = {
  prompt: string;
  explanation: string | null;
  correctChoice: number | null;
  unitId: string | null;
  choices: { ord: number; text: string }[];
};

export const CHAT_MAX_CHARS = 2000;
export const CHAT_HISTORY_TURNS = 8;

/** 마지막 사용자 메시지 (없으면 null) */
export function lastUserMessage(messages: ChatMessage[]): ChatMessage | null {
  return [...messages].reverse().find((m) => m.role === "user") ?? null;
}

/** 화면에 보인 순서(choiceOrder: 원본 ord 배열)대로 1번부터 번호를 매긴다. 순서가 맞지 않으면 원본 ord 순 */
export function orderChoices<C extends { ord: number }>(choices: C[], choiceOrder?: number[] | null): C[] {
  const sorted = [...choices].sort((a, b) => a.ord - b.ord);
  const byOrd = new Map(sorted.map((c) => [c.ord, c]));
  if (choiceOrder && choiceOrder.length === sorted.length && choiceOrder.every((o) => byOrd.has(o))) return choiceOrder.map((o) => byOrd.get(o) as C);
  return sorted;
}

/** 문항 맥락 문자열. reveal=false 면 정답 표시는 남기되 학습자에게 공개하지 말라고 적는다 */
export function questionContextText(q: ChatQuestionContext, reveal: boolean, choiceOrder?: number[] | null): string {
  const choices = orderChoices(q.choices, choiceOrder);
  const mark = reveal ? " (정답)" : " (정답 — 학습자에게 아직 공개하지 말 것)";
  return `문항: ${q.prompt}\n${choices.map((c, i) => `${i + 1}) ${c.text}${c.ord === q.correctChoice ? mark : ""}`).join("\n")}${reveal && q.explanation ? `\n해설: ${q.explanation}` : ""}`;
}

/** 검색 조각 → 프롬프트의 [자료] 본문 */
export function passagesText(hits: SearchHit[]): string {
  return hits.map((h, i) => `[${i + 1}] (${h.label}) ${h.content.replace(/\s+/g, " ").slice(0, 1500)}`).join("\n\n");
}

export type ChatPrompt = { system: string; userContext: string };

/** 시스템 지시 + 맥락 메시지 (옛 chatAction 의 문구 그대로) */
export function buildChatPrompt(input: { mode: AiMode; lang: ChatLang; reveal: boolean; context: string; passages: string }): ChatPrompt {
  const langRule = input.lang === "en" ? "Answer in English (the materials may be in Korean; translate what you cite)." : "한국어로 답한다.";
  const system =
    input.mode === "grounded"
      ? `너는 학습 도우미다. 아래 [자료] 에 있는 내용만 근거로 답한다. ${langRule} 자료에 없는 내용은 "자료에서 찾지 못했다"고 말하고 추측하지 않는다.
답할 때 근거로 쓴 자료를 문장 끝에 대괄호 번호로 표시한다 (예: … 입니다 [2]). 같은 번호의 출처 이름(예: 40강 스크립트, 책 p.292)을 답 마지막 줄에 "출처: [1] 40강 스크립트, [2] 책 p.292" 형식으로 정리한다. 간결하게, 시험 공부에 바로 쓸 수 있게 핵심만 답한다.`
      : `너는 학습 도우미(튜터)다. 이 주제에는 올려 둔 자료가 없으므로 네 일반 지식으로 답한다. ${langRule}
질문에 바로 답한 뒤, 도움이 되는 파생 정보(핵심 규칙, 예문 2~3개, 비슷한 표현과의 차이, 학습자가 자주 틀리는 점)를 짧게 덧붙인다. 문항 맥락이 있으면 왜 정답이 맞고 다른 보기는 왜 틀리는지 설명한다.
확실하지 않은 것은 그렇다고 말한다. 출처를 지어내지 않는다. 간결하게, 바로 공부에 쓸 수 있게 답한다.`;
  const formatRule = "\n형식: 마크다운을 쓰지 않는다. 굵게(**), 머리글(#), 표를 쓰지 말고, 강조할 말은 작은따옴표로 감싼다. 목록이 필요하면 '- ' 나 '1)' 로 시작하는 줄로 쓴다. 코드는 그 줄만 따로 쓴다.";
  const hintRule = input.reveal
    ? ""
    : "\n학습자는 아직 이 문항의 답을 고르지 않았다. 정답 번호나 정답 자체를 직접 말하지 말고, 개념 설명·접근 방법·힌트로 돕는다. 학습자가 분명하게 정답을 알려 달라고 하면 그때는 알려 준다.";
  const userContext =
    input.mode === "grounded"
      ? `${input.context ? `[문항 맥락]\n${input.context}\n\n` : ""}[자료]\n${input.passages || "(관련 자료를 찾지 못함)"}`
      : `${input.context ? `[문항 맥락]\n${input.context}` : "(문항 맥락 없음)"}`;
  return { system: system + formatRule + hintRule, userContext };
}

export function hitsToChatSources(hits: SearchHit[]): ChatSource[] {
  return hits.map((h) => ({ label: h.label, sourceId: h.sourceId, chunkId: h.id, kind: h.kind, page: h.page, snippet: h.snippet }));
}

/** 대화 기록(question/answer 행) → 메시지 열. 답이 없는 기록은 질문만 */
export function historyToMessages(rows: { question: string; answer: string | null }[], plain: (s: string) => string): ChatMessage[] {
  return rows.flatMap((r): ChatMessage[] => (r.answer ? [{ role: "user", content: r.question }, { role: "assistant", content: plain(r.answer) }] : [{ role: "user", content: r.question }]));
}
