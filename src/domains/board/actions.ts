"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/domains/auth/supabase/server";
import { requireUser } from "@/domains/auth/session";
import type { ActionResult } from "@/domains/shared/types";

const DAILY_LIMIT = 10;

async function countToday(table: "board_posts" | "question_reports", userId: string) {
  const db = await createClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  return count ?? 0;
}

export async function createPostAction(input: { kind: string; title: string; body: string }): Promise<ActionResult> {
  const user = await requireUser();
  const title = input.title.trim();
  const body = input.body.trim();
  const kind = ["bug", "idea", "praise", "other"].includes(input.kind) ? input.kind : "other";
  if (!title || title.length > 80) return { ok: false, error: "제목은 1~80자입니다." };
  if (!body || body.length > 500) return { ok: false, error: "내용은 1~500자입니다." };
  if ((await countToday("board_posts", user.id)) >= DAILY_LIMIT) return { ok: false, error: `하루에 ${DAILY_LIMIT}개까지 쓸 수 있습니다.` };
  const db = await createClient();
  const { error } = await db.from("board_posts").insert({ user_id: user.id, kind, title, body });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/board");
  return { ok: true, data: undefined };
}

export async function deletePostAction(id: string): Promise<ActionResult> {
  await requireUser();
  const db = await createClient();
  const { error } = await db.from("board_posts").delete().eq("id", id);
  revalidatePath("/board");
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

/** 관리자: 상태·답글 */
export async function adminUpdatePostAction(input: { id: string; status?: string; reply?: string | null }): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.isAdmin) return { ok: false, error: "관리자만 할 수 있습니다." };
  const db = await createClient();
  const patch: { status?: string; admin_reply?: string | null; updated_at: string } = { updated_at: new Date().toISOString() };
  if (input.status && ["open", "progress", "done"].includes(input.status)) patch.status = input.status;
  if (input.reply !== undefined) patch.admin_reply = input.reply?.trim() || null;
  const { error } = await db.from("board_posts").update(patch).eq("id", input.id);
  revalidatePath("/board");
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

/** 문제 신고 (하루 10건) */
export async function reportQuestionAction(input: { questionId: string; kind: string; message: string }): Promise<ActionResult> {
  const user = await requireUser();
  const message = input.message.trim();
  const kind = ["answer", "ambiguous", "typo", "other"].includes(input.kind) ? input.kind : "other";
  if (!message || message.length > 100) return { ok: false, error: "내용은 1~100자입니다." };
  if ((await countToday("question_reports", user.id)) >= DAILY_LIMIT) return { ok: false, error: `신고는 하루에 ${DAILY_LIMIT}건까지입니다.` };
  const db = await createClient();
  const { error } = await db.from("question_reports").insert({ user_id: user.id, question_id: input.questionId, kind, message });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function resolveReportAction(id: string, status: "open" | "done"): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.isAdmin) return { ok: false, error: "관리자만 할 수 있습니다." };
  const db = await createClient();
  const { error } = await db.from("question_reports").update({ status }).eq("id", id);
  revalidatePath("/admin/reports");
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}
