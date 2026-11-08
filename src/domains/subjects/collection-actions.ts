"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/domains/auth/supabase/server";
import { requireUser } from "@/domains/auth/session";
import type { ActionResult, Collection } from "@/domains/shared/types";

export async function createCollectionAction(input: {
  subjectId: string;
  parentId: string | null;
  title: string;
  scope: "shared" | "private";
}): Promise<ActionResult<Collection>> {
  const user = await requireUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "묶음 이름을 입력하세요." };
  const scope = input.scope === "shared" && user.isAdmin ? "shared" : "private";
  const db = await createClient();
  const { data, error } = await db
    .from("collections")
    .insert({ subject_id: input.subjectId, parent_id: input.parentId, title, scope, created_by: user.id })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/subjects/${input.subjectId}`);
  return { ok: true, data };
}

export async function renameCollectionAction(id: string, title: string): Promise<ActionResult> {
  await requireUser();
  const db = await createClient();
  const { error } = await db.from("collections").update({ title: title.trim() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

export async function deleteCollectionAction(id: string): Promise<ActionResult> {
  await requireUser();
  const db = await createClient();
  const { error } = await db.from("collections").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

/** 퀴즈 결과·약점 화면의 "묶음에 추가" */
export async function addToCollectionAction(collectionId: string, questionIds: string[]): Promise<ActionResult<number>> {
  await requireUser();
  if (questionIds.length === 0) return { ok: true, data: 0 };
  const db = await createClient();
  const rows = questionIds.map((question_id) => ({ collection_id: collectionId, question_id }));
  const { error } = await db.from("collection_items").upsert(rows, { ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: rows.length };
}

export async function removeFromCollectionAction(collectionId: string, questionId: string): Promise<ActionResult> {
  await requireUser();
  const db = await createClient();
  const { error } = await db
    .from("collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("question_id", questionId);
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

/** 사용자가 쓸 수 있는 묶음 목록 (공용 + 내 것) */
export async function listMyCollectionsAction(subjectId: string): Promise<Collection[]> {
  await requireUser();
  const db = await createClient();
  const { data } = await db.from("collections").select("*").eq("subject_id", subjectId).order("sort");
  return data ?? [];
}
