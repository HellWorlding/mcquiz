"use server";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import type { ActionResult } from "@/domains/shared/types";

/** 문항 메모 저장. 비우면 삭제. */
export async function saveNoteAction(questionId: string, content: string): Promise<ActionResult<"saved" | "deleted" | "guest">> {
  const user = await getCurrentUser();
  if (!user) return { ok: true, data: "guest" };
  const db = await createClient();
  const text = content.trim();
  if (!text) {
    const { error } = await db.from("question_notes").delete().eq("user_id", user.id).eq("question_id", questionId);
    return error ? { ok: false, error: error.message } : { ok: true, data: "deleted" };
  }
  const { error } = await db
    .from("question_notes")
    .upsert({ user_id: user.id, question_id: questionId, content: text, updated_at: new Date().toISOString() }, { onConflict: "user_id,question_id" });
  return error ? { ok: false, error: error.message } : { ok: true, data: "saved" };
}
