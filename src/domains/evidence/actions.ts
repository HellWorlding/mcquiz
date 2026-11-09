"use server";
import { createClient } from "@/domains/auth/supabase/server";
import { requireUser } from "@/domains/auth/session";
import { env, hasOpenAI } from "@/domains/shared/env";
import type { ActionResult } from "@/domains/shared/types";
import { findEvidence, type EvidenceHit } from "./search";
import { getLang } from "@/domains/shared/i18n-server";
import { getAiQuota, type AiQuota } from "./quota";

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
    if (u) unitTitle = u.no ? `${u.no}강 ${u.title}` : u.title;
  }
  const hits = await findEvidence(db, { subjectId: q.subject_id, unitIds: q.unit_id ? [q.unit_id] : null, query, limit: 6 });
  return { ok: true, data: { hits, unitTitle } };
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatReply = { answer: string; sources: { label: string; sourceId: string; page: number | null; snippet: string }[]; quota: AiQuota };

/**
 * 챗봇: 질문(과 문항 맥락)으로 자료를 검색한 뒤, 찾은 조각만 근거로 답한다. 출처를 함께 돌려준다.
 */
export async function chatAction(input: { subjectId: string; questionId: string | null; messages: ChatMessage[] }): Promise<ActionResult<ChatReply>> {
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

  let context = "";
  let unitIds: string[] | null = null;
  if (input.questionId) {
    const { data: q } = await db.from("questions").select("*, choices(*)").eq("id", input.questionId).maybeSingle();
    if (q) {
      const choices = [...(q.choices ?? [])].sort((a, b) => a.ord - b.ord);
      context = `문항: ${q.prompt}\n${choices.map((c) => `${c.ord}) ${c.text}${c.ord === q.correct_choice ? " (정답)" : ""}`).join("\n")}${q.explanation ? `\n해설: ${q.explanation}` : ""}`;
      if (q.unit_id) unitIds = [q.unit_id];
    }
  }
  const hits = await findEvidence(db, { subjectId: input.subjectId, unitIds, query: `${last.content} ${context}`, limit: 8 });
  const passages = hits.map((h, i) => `[${i + 1}] (${h.label}) ${h.content.replace(/\s+/g, " ").slice(0, 1500)}`).join("\n\n");

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const lang = await getLang();
  const langRule = lang === "en" ? "Answer in English (the materials may be in Korean; translate what you cite)." : "한국어로 답한다.";
  const system = `너는 학습 도우미다. 아래 [자료] 에 있는 내용만 근거로 답한다. ${langRule} 자료에 없는 내용은 "자료에서 찾지 못했다"고 말하고 추측하지 않는다.
답할 때 근거로 쓴 자료를 문장 끝에 대괄호 번호로 표시한다 (예: … 입니다 [2]). 같은 번호의 출처 이름(예: 40강 스크립트, 책 p.292)을 답 마지막 줄에 "출처: [1] 40강 스크립트, [2] 책 p.292" 형식으로 정리한다. 간결하게, 시험 공부에 바로 쓸 수 있게 핵심만 답한다.`;
  const userContext = `${context ? `[문항 맥락]\n${context}\n\n` : ""}[자료]\n${passages || "(관련 자료를 찾지 못함)"}`;

  try {
    const res = await client.responses.create({
      model: env.openaiModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: userContext },
        ...input.messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    const answer = res.output_text?.trim() || "답을 만들지 못했습니다.";
    const sources = hits.map((h) => ({ label: h.label, sourceId: h.sourceId, page: h.page, snippet: h.snippet }));
    await db.from("ai_questions").insert({
      user_id: user.id,
      subject_id: input.subjectId,
      question_id: input.questionId,
      question: last.content.trim(),
      answer,
      sources: sources.map((s) => ({ label: s.label, page: s.page })),
    });
    return { ok: true, data: { answer, sources, quota: { ...quota, used: quota.used + 1, remaining: quota.remaining - 1 } } };
  } catch (e) {
    return { ok: false, error: `AI 호출 실패: ${(e as Error).message}` };
  }
}
