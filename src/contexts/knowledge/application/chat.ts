import { err, ok, type Result } from "@/shared/result";
import { aiModeFor, type AiMode } from "../domain/ai-mode";
import { buildChatPrompt, CHAT_HISTORY_TURNS, CHAT_MAX_CHARS, historyToMessages, hitsToChatSources, lastUserMessage, passagesText, questionContextText, type ChatLang, type ChatMessage, type ChatSource } from "../domain/chat";
import { plainText } from "../domain/plain";
import { computeQuota, consumeQuota, quotaExceededMessage, quotaLimit, quotaWindowStart, type AiQuota } from "../domain/quota";
import { message, requireUser } from "./guards";
import type { KnowledgeDeps } from "./ports";
import { searchSources } from "./search";

export type ChatInput = {
  subjectId: string;
  questionId: string | null;
  messages: ChatMessage[];
  /** false 면 아직 답을 고르기 전: 정답을 직접 말하지 않고 힌트로만 */
  revealAnswer?: boolean;
  /** 화면에 보인 선지의 원본 ord 순서 */
  choiceOrder?: number[];
  lang?: ChatLang;
};
export type ChatReply = { answer: string; sources: ChatSource[]; quota: AiQuota; mode: AiMode };
export type ChatContext = { mode: AiMode; quota: AiQuota; aiEnabled: boolean; history: ChatMessage[] };

/** K5. 사용자의 현재 한도 (12시간 창) */
export async function aiQuota(deps: KnowledgeDeps, user: NonNullable<KnowledgeDeps["user"]>): Promise<AiQuota> {
  const now = deps.now();
  const stamps = await deps.chatLogs.timestampsSince(user.id, quotaWindowStart(now).toISOString());
  return computeQuota(now, stamps, quotaLimit(user));
}

export async function aiMode(deps: KnowledgeDeps, subjectId: string): Promise<AiMode> {
  return aiModeFor(await deps.sources.countBySubject(subjectId));
}

/** 채팅을 열 때: 남은 횟수, 과목의 AI 모드, 이 문항으로 전에 나눈 대화(최근 6건). 로그인 필요 */
export async function chatContext(deps: KnowledgeDeps, subjectId: string, questionId?: string | null): Promise<Result<ChatContext>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  try {
    const [quota, mode] = await Promise.all([aiQuota(deps, g.data), aiMode(deps, subjectId)]);
    const history = questionId ? historyToMessages(await deps.chatLogs.recentForQuestion(g.data.id, questionId, 6), plainText) : [];
    return ok({ quota, mode, aiEnabled: deps.chatModel !== null, history });
  } catch (e) {
    return err(message(e));
  }
}

/**
 * K5. 챗봇. grounded 과목은 질문(과 문항 맥락)으로 자료를 검색한 뒤 찾은 조각만 근거로 답하고 출처를 돌려준다.
 * open 과목은 AI 의 일반 지식으로 답한다. 한도를 넘으면 거부. 로그인 필요
 */
export async function chat(deps: KnowledgeDeps, input: ChatInput): Promise<Result<ChatReply>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  const user = g.data;
  if (!deps.chatModel) return err("AI 기능이 꺼져 있습니다 (OPENAI_API_KEY 없음). 근거 찾기는 AI 없이도 됩니다.");
  const last = lastUserMessage(input.messages);
  if (!last?.content.trim()) return err("질문을 입력하세요.");
  if (last.content.length > CHAT_MAX_CHARS) return err(`질문이 너무 깁니다 (${CHAT_MAX_CHARS.toLocaleString()}자 이내).`);
  try {
    const quota = await aiQuota(deps, user);
    if (quota.remaining <= 0) return err(quotaExceededMessage(quota));
    const mode = await aiMode(deps, input.subjectId);
    const reveal = input.revealAnswer !== false;

    let context = "";
    let unitIds: string[] | null = null;
    if (input.questionId) {
      const q = await deps.catalog.questionById(input.questionId);
      if (q) {
        context = questionContextText(q, reveal, input.choiceOrder);
        if (q.unitId) unitIds = [q.unitId];
      }
    }
    const hits = mode === "grounded" ? await searchSources(deps, { subjectId: input.subjectId, unitIds, query: `${last.content} ${context}`, limit: 8 }) : [];
    const prompt = buildChatPrompt({ mode, lang: input.lang ?? "ko", reveal, context, passages: passagesText(hits) });

    let answer: string;
    try {
      const raw = await deps.chatModel.complete({ system: prompt.system, userContext: prompt.userContext, messages: input.messages.slice(-CHAT_HISTORY_TURNS) });
      answer = plainText(raw) || "답을 만들지 못했습니다.";
    } catch (e) {
      return err(`AI 호출 실패: ${message(e)}`);
    }
    const sources = hitsToChatSources(hits);
    await deps.chatLogs.insert({ userId: user.id, subjectId: input.subjectId, questionId: input.questionId, question: last.content.trim(), answer, sources: sources.map((s) => ({ label: s.label, page: s.page })) });
    return ok({ answer, sources, mode, quota: consumeQuota(quota) });
  } catch (e) {
    return err(message(e));
  }
}
