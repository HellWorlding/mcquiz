"use server";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser, requireUser } from "@/domains/auth/session";
import { env, hasOpenAI } from "@/domains/shared/env";
import type { ActionResult } from "@/domains/shared/types";
import { findEvidence, type EvidenceHit } from "./search";
import { getLang } from "@/domains/shared/i18n-server";
import { getAiQuota, type AiQuota } from "./quota";
import { unitLabel } from "@/domains/shared/labels";
import { getAiMode, type AiMode } from "./mode";
import { plainText } from "./plain";

export type EvidenceResult = { hits: EvidenceHit[]; unitTitle: string | null };

/** 문항의 정답 근거를 단원 자료(스크립트·책)에서 찾는다 */
export async function findEvidenceAction(questionId: string): Promise<ActionResult<EvidenceResult>> {
  await requireUser();
  const db = await createClient();
  const { data: q } = await db.from("questions").select("*, choices(*)").eq("id", questionId).maybeSingle();
  if (!q) return { ok: false, error: "문항을 찾을 수 없습니다." };
  const correct = (q.choices ?? []).find((c) => c.ord === q.correct_choice);
  const query = [q.topic ?? "", q.prompt, correct?.text ?? "", q.source_quote ?? ""].join(" ");
  let unitTitle: string | null = null;
  if (q.unit_id) {
    const { data: u } = await db.from("units").select("title, no").eq("id", q.unit_id).maybeSingle();
    if (u) unitTitle = unitLabel(u.no, u.title);
  }
  const hits = await findEvidence(db, { subjectId: q.subject_id, unitIds: q.unit_id ? [q.unit_id] : null, query, limit: 6 });
  return { ok: true, data: { hits, unitTitle } };
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatReply = { answer: string; sources: { label: string; sourceId: string; chunkId: string; kind: string; page: number | null; snippet: string }[]; quota: AiQuota; mode: AiMode };

/**
 * 챗봇. 자료를 올린 주제(grounded)는 질문(과 문항 맥락)으로 자료를 검색한 뒤 찾은 조각만 근거로 답하고 출처를 돌려준다.
 * 자료가 없는 주제(open)는 AI 의 일반 지식으로 답하며, 관련 파생 정보(예문·유사 표현·흔한 오류)도 함께 준다.
 */
export async function chatAction(input: { subjectId: string; questionId: string | null; messages: ChatMessage[]; revealAnswer?: boolean; choiceOrder?: number[] }): Promise<ActionResult<ChatReply>> {
  const user = await requireUser();
  if (!hasOpenAI()) return { ok: false, error: "AI 기능이 꺼져 있습니다 (OPENAI_API_KEY 없음). 근거 찾기는 AI 없이도 됩니다." };
  const last = [...input.messages].reverse().find((m) => m.role === "user");
  if (!last?.content.trim()) return { ok: false, error: "질문을 입력하세요." };
  if (last.content.length > 2000) return { ok: false, error: "질문이 너무 깁니다 (2,000자 이내)." };
  // 사용량 제한: 지난 12시간 기준, 관리자 100회 / 일반 10회
  const quota = await getAiQuota(user);
  if (quota.remaining <= 0) {
    const reset = quota.resetAt ? new Date(quota.resetAt).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }) : "";
    return { ok: false, error: `AI 질문 한도(${quota.windowHours}시간에 ${quota.limit}회)를 다 썼습니다. ${reset ? `${reset} 이후에 다시 할 수 있습니다.` : ""}` };
  }
  const db = await createClient();
  const mode = await getAiMode(db, input.subjectId);

  // 아직 답을 고르기 전(revealAnswer=false)이면 정답을 직접 말하지 않고 힌트로만 돕는다
  const reveal = input.revealAnswer !== false;
  let context = "";
  let unitIds: string[] | null = null;
  if (input.questionId) {
    const { data: q } = await db.from("questions").select("*, choices(*)").eq("id", input.questionId).maybeSingle();
    if (q) {
      // 화면에는 선지가 섞여 보이므로, 학습자가 보는 순서(choiceOrder)대로 1번부터 번호를 매긴다
      let choices = [...(q.choices ?? [])].sort((a, b) => a.ord - b.ord);
      const byOrd = new Map(choices.map((c) => [c.ord, c]));
      const co = input.choiceOrder;
      if (co && co.length === choices.length && co.every((o) => byOrd.has(o))) choices = co.map((o) => byOrd.get(o) as (typeof choices)[number]);
      const mark = reveal ? " (정답)" : " (정답 — 학습자에게 아직 공개하지 말 것)";
      context = `문항: ${q.prompt}\n${choices.map((c, i) => `${i + 1}) ${c.text}${c.ord === q.correct_choice ? mark : ""}`).join("\n")}${reveal && q.explanation ? `\n해설: ${q.explanation}` : ""}`;
      if (q.unit_id) unitIds = [q.unit_id];
    }
  }
  const hits = mode === "grounded" ? await findEvidence(db, { subjectId: input.subjectId, unitIds, query: `${last.content} ${context}`, limit: 8 }) : [];
  const passages = hits.map((h, i) => `[${i + 1}] (${h.label}) ${h.content.replace(/\s+/g, " ").slice(0, 1500)}`).join("\n\n");

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const lang = await getLang();
  const langRule = lang === "en" ? "Answer in English (the materials may be in Korean; translate what you cite)." : "한국어로 답한다.";
  const system =
    mode === "grounded"
      ? `너는 학습 도우미다. 아래 [자료] 에 있는 내용만 근거로 답한다. ${langRule} 자료에 없는 내용은 "자료에서 찾지 못했다"고 말하고 추측하지 않는다.
답할 때 근거로 쓴 자료를 문장 끝에 대괄호 번호로 표시한다 (예: … 입니다 [2]). 같은 번호의 출처 이름(예: 40강 스크립트, 책 p.292)을 답 마지막 줄에 "출처: [1] 40강 스크립트, [2] 책 p.292" 형식으로 정리한다. 간결하게, 시험 공부에 바로 쓸 수 있게 핵심만 답한다.`
      : `너는 학습 도우미(튜터)다. 이 주제에는 올려 둔 자료가 없으므로 네 일반 지식으로 답한다. ${langRule}
질문에 바로 답한 뒤, 도움이 되는 파생 정보(핵심 규칙, 예문 2~3개, 비슷한 표현과의 차이, 학습자가 자주 틀리는 점)를 짧게 덧붙인다. 문항 맥락이 있으면 왜 정답이 맞고 다른 보기는 왜 틀리는지 설명한다.
확실하지 않은 것은 그렇다고 말한다. 출처를 지어내지 않는다. 간결하게, 바로 공부에 쓸 수 있게 답한다.`;
  const formatRule = "\n형식: 마크다운을 쓰지 않는다. 굵게(**), 머리글(#), 표를 쓰지 말고, 강조할 말은 작은따옴표로 감싼다. 목록이 필요하면 '- ' 나 '1)' 로 시작하는 줄로 쓴다. 코드는 그 줄만 따로 쓴다.";
  const hintRule = reveal
    ? ""
    : "\n학습자는 아직 이 문항의 답을 고르지 않았다. 정답 번호나 정답 자체를 직접 말하지 말고, 개념 설명·접근 방법·힌트로 돕는다. 학습자가 분명하게 정답을 알려 달라고 하면 그때는 알려 준다.";
  const userContext =
    mode === "grounded"
      ? `${context ? `[문항 맥락]\n${context}\n\n` : ""}[자료]\n${passages || "(관련 자료를 찾지 못함)"}`
      : `${context ? `[문항 맥락]\n${context}` : "(문항 맥락 없음)"}`;

  try {
    const res = await client.responses.create({
      model: env.openaiModel,
      input: [
        { role: "system", content: system + formatRule + hintRule },
        { role: "user", content: userContext },
        ...input.messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    const answer = plainText(res.output_text ?? "") || "답을 만들지 못했습니다.";
    const sources = hits.map((h) => ({ label: h.label, sourceId: h.sourceId, chunkId: h.chunkId, kind: h.kind, page: h.page, snippet: h.snippet }));
    await db.from("ai_questions").insert({
      user_id: user.id,
      subject_id: input.subjectId,
      question_id: input.questionId,
      question: last.content.trim(),
      answer,
      sources: sources.map((s) => ({ label: s.label, page: s.page })),
    });
    return { ok: true, data: { answer, sources, mode, quota: { ...quota, used: quota.used + 1, remaining: quota.remaining - 1 } } };
  } catch (e) {
    return { ok: false, error: `AI 호출 실패: ${(e as Error).message}` };
  }
}

export type ChatOpenResult = { quota: AiQuota; mode: AiMode; aiEnabled: boolean; history: ChatMessage[] };

/** 채팅 모달을 열 때: 남은 횟수, 주제의 AI 모드, 이 문항으로 전에 나눈 대화(최근 6건) */
export async function openChatAction(subjectId: string, questionId: string | null): Promise<ActionResult<ChatOpenResult>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const db = await createClient();
  const [quota, mode] = await Promise.all([getAiQuota(user), getAiMode(db, subjectId)]);
  let history: ChatMessage[] = [];
  if (questionId) {
    const { data } = await db
      .from("ai_questions")
      .select("question, answer, created_at")
      .eq("user_id", user.id)
      .eq("question_id", questionId)
      .order("created_at", { ascending: false })
      .limit(6);
    history = (data ?? [])
      .reverse()
      .flatMap((r): ChatMessage[] => (r.answer ? [{ role: "user", content: r.question }, { role: "assistant", content: plainText(r.answer) }] : [{ role: "user", content: r.question }]));
  }
  return { ok: true, data: { quota, mode, aiEnabled: hasOpenAI(), history } };
}
