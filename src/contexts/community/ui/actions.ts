"use server";
import { revalidatePath } from "next/cache";
import type { Result } from "@/shared/result";
import type { ReportStatus } from "../domain/report";
import { createPost, deletePost, updatePost } from "../application/posts";
import { reportQuestion, resolveReport } from "../application/reports";
import { sessionCommunityDeps } from "./deps";

export async function createPostAction(input: { kind: string; title: string; body: string }): Promise<Result<void>> {
  const r = await createPost(await sessionCommunityDeps(), input);
  if (r.ok) revalidatePath("/board");
  return r;
}

export async function deletePostAction(id: string): Promise<Result<void>> {
  const r = await deletePost(await sessionCommunityDeps(), id);
  revalidatePath("/board");
  return r;
}

/** 관리자: 상태·답글 */
export async function adminUpdatePostAction(input: { id: string; status?: string; reply?: string | null }): Promise<Result<void>> {
  const r = await updatePost(await sessionCommunityDeps(), input.id, { status: input.status, reply: input.reply });
  revalidatePath("/board");
  return r;
}

/** 문항 신고 (하루 10건) */
export async function reportQuestionAction(input: { questionId: string; kind: string; message: string }): Promise<Result<void>> {
  return reportQuestion(await sessionCommunityDeps(), input);
}

export async function resolveReportAction(id: string, status: ReportStatus): Promise<Result<void>> {
  const r = await resolveReport(await sessionCommunityDeps(), id, status);
  revalidatePath("/admin/reports");
  return r;
}
