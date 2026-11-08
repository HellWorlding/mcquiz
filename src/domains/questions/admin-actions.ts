"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/domains/auth/supabase/server";
import { requireAdmin } from "@/domains/auth/session";
import type { ActionResult } from "@/domains/shared/types";
import type { Database } from "@/domains/shared/database.types";

type QuestionPatch = Database["public"]["Tables"]["questions"]["Update"];
type ChoicePatch = Database["public"]["Tables"]["choices"]["Update"];

export async function updateQuestionAction(input: {
  id: string;
  prompt?: string;
  unitId?: string | null;
  correctChoice?: number | null;
  hint?: string | null;
  tags?: string[];
  needsReview?: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const patch: QuestionPatch = {};
  if (input.prompt !== undefined) patch.prompt = input.prompt.trim();
  if (input.unitId !== undefined) {
    patch.unit_id = input.unitId;
    patch.unit_confidence = input.unitId ? 1 : null;
  }
  if (input.correctChoice !== undefined) {
    patch.correct_choice = input.correctChoice;
    patch.needs_review = input.correctChoice === null;
  }
  if (input.hint !== undefined) patch.hint = input.hint?.trim() || null;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.needsReview !== undefined) patch.needs_review = input.needsReview;
  const { error } = await db.from("questions").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function updateChoiceAction(input: {
  id: string;
  text?: string;
  explanation?: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const patch: ChoicePatch = {};
  if (input.text !== undefined) patch.text = input.text.trim();
  if (input.explanation !== undefined) patch.explanation = input.explanation?.trim() || null;
  const { error } = await db.from("choices").update(patch).eq("id", input.id);
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

export async function deleteQuestionAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const { error } = await db.from("questions").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

export async function deleteSetAction(setId: string, subjectId: string): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const { error } = await db.from("question_sets").delete().eq("id", setId);
  revalidatePath(`/admin/sets`);
  revalidatePath(`/subjects/${subjectId}`);
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}
