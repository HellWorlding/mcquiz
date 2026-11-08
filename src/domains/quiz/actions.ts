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
