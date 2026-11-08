"use server";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import type { ActionResult } from "@/domains/shared/types";

/** 저장된 문제 목록에서 빼기. 이후에 다시 틀리거나 저장하면 다시 들어온다. */
export async function dismissQuestionAction(questionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const db = await createClient();
  const { error } = await db
    .from("question_marks")
    .upsert({ user_id: user.id, question_id: questionId, kind: "dismissed", at: new Date().toISOString() }, { onConflict: "user_id,question_id,kind" });
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

/** 문제 직접 저장 / 저장 취소 */
export async function saveQuestionAction(questionId: string, saved: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const db = await createClient();
  if (saved) {
    const { error } = await db
      .from("question_marks")
      .upsert({ user_id: user.id, question_id: questionId, kind: "saved", at: new Date().toISOString() }, { onConflict: "user_id,question_id,kind" });
    return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
  }
  const { error } = await db.from("question_marks").delete().eq("user_id", user.id).eq("question_id", questionId).eq("kind", "saved");
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}
