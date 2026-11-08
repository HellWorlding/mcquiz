"use server";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import type { ActionResult } from "@/domains/shared/types";

/** 답을 고르면 attempts 에 기록한다. 비로그인(게스트)은 저장하지 않고 null 을 돌려준다. */
export async function recordAttemptAction(input: {
  questionId: string;
  selectedOrd: number | null;
  isCorrect: boolean | null;
  confused: boolean;
}): Promise<ActionResult<string | null>> {
  const user = await getCurrentUser();
  if (!user) return { ok: true, data: null };
  const db = await createClient();
  const { data, error } = await db
    .from("attempts")
    .insert({
      user_id: user.id,
      question_id: input.questionId,
      selected_ord: input.selectedOrd,
      is_correct: input.isCorrect,
      confused: input.confused,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data.id };
}

export async function setConfusedAction(attemptId: string, confused: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: true, data: undefined };
  const db = await createClient();
  const { error } = await db.from("attempts").update({ confused }).eq("id", attemptId).eq("user_id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

export type SessionAnswer = { selectedOrd: number | null; isCorrect: boolean | null; confused: boolean };

/** 퀴즈 진행 상태 저장. sessionId 가 없으면 새로 만들고 id 를 돌려준다. 게스트는 저장하지 않는다. */
export async function saveProgressAction(input: {
  sessionId: string | null;
  subjectId: string | null;
  title: string;
  questionIds: string[];
  position: number;
  answers: Record<string, SessionAnswer>;
  finished: boolean;
}): Promise<ActionResult<string | null>> {
  const user = await getCurrentUser();
  if (!user) return { ok: true, data: null };
  const db = await createClient();
  const row = {
    user_id: user.id,
    subject_id: input.subjectId,
    title: input.title,
    question_ids: input.questionIds,
    position: input.position,
    answers: input.answers,
    finished: input.finished,
    updated_at: new Date().toISOString(),
  };
  if (input.sessionId) {
    const { error } = await db.from("quiz_sessions").update(row).eq("id", input.sessionId).eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: input.sessionId };
  }
  const { data, error } = await db.from("quiz_sessions").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data.id };
}

export async function deleteSessionAction(sessionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: true, data: undefined };
  const db = await createClient();
  const { error } = await db.from("quiz_sessions").delete().eq("id", sessionId).eq("user_id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}
