"use server";
import { revalidatePath } from "next/cache";
import { sessionDb } from "@/shared/db/server";
import type { Result } from "@/shared/result";
import { getCurrentUser } from "@/contexts/access";
import type { Collection, Visibility } from "../domain/types";
import type { PreviewQuestion } from "../domain/import/types";
import { makeCatalogDeps } from "../infrastructure/make-deps";
import * as subjects from "../application/subjects";
import * as units from "../application/units";
import * as questions from "../application/questions";
import * as collections from "../application/collections";
import { commitImport, previewImport, type ImportPreview, type SaveSummary } from "../application/import";

export type { ImportPreview, SaveSummary };

async function deps() {
  const [db, user] = await Promise.all([sessionDb(), getCurrentUser()]);
  return makeCatalogDeps(db, user);
}

const done = <T>(r: Result<T>): Result<void> => (r.ok ? { ok: true, data: undefined } : r);

// ---------------- 과목 ----------------

export async function createSubjectAction(formData: FormData): Promise<Result<void>> {
  const name = String(formData.get("name") ?? "");
  const visibility: Visibility = String(formData.get("visibility") ?? "public") === "restricted" ? "restricted" : "public";
  const r = await subjects.createSubject(await deps(), name, visibility);
  revalidatePath("/admin");
  return done(r);
}

export async function setSubjectVisibilityAction(subjectId: string, visibility: Visibility): Promise<Result<void>> {
  const r = await subjects.setSubjectVisibility(await deps(), subjectId, visibility);
  revalidatePath("/admin");
  return r;
}

// ---------------- 단원 트리 ----------------

export async function createUnitAction(input: { subjectId: string; parentId: string | null; title: string; no: number | null }): Promise<Result<void>> {
  const r = await units.createUnit(await deps(), input);
  revalidatePath("/admin/units");
  return done(r);
}

/** "파트1~파트30 한 번에 만들기" */
export async function bulkCreateUnitsAction(input: { subjectId: string; parentId: string | null; prefix: string; from: number; to: number; suffix?: string }): Promise<Result<number>> {
  const r = await units.bulkCreateUnits(await deps(), input);
  revalidatePath("/admin/units");
  return r;
}

export async function renameUnitAction(unitId: string, title: string): Promise<Result<void>> {
  const r = await units.renameUnit(await deps(), unitId, title);
  revalidatePath("/admin/units");
  return r;
}

export async function moveUnitAction(unitId: string, direction: "up" | "down"): Promise<Result<void>> {
  const r = await units.moveUnit(await deps(), unitId, direction);
  revalidatePath("/admin/units");
  return r;
}

export async function deleteUnitAction(unitId: string): Promise<Result<void>> {
  const r = await units.deleteUnit(await deps(), unitId);
  revalidatePath("/admin/units");
  return r;
}

export async function setUnitPriorityAction(unitId: string, priority: 1 | 2 | 3 | 4 | 5 | null): Promise<Result<void>> {
  const r = await units.setUnitPriority(await deps(), unitId, priority);
  revalidatePath("/admin/units");
  return r;
}

// ---------------- 문항 편집 ----------------

export async function updateQuestionAction(input: questions.UpdateQuestionInput): Promise<Result<void>> {
  return questions.updateQuestion(await deps(), input);
}

export async function updateChoiceAction(input: { questionId: string; ord: number; text?: string; explanation?: string | null }): Promise<Result<void>> {
  return questions.updateChoice(await deps(), input.questionId, input.ord, { text: input.text, explanation: input.explanation });
}

export async function deleteQuestionAction(id: string): Promise<Result<void>> {
  return questions.deleteQuestion(await deps(), id);
}

export async function deleteSetAction(setId: string, subjectId: string): Promise<Result<void>> {
  const r = await questions.deleteSet(await deps(), setId);
  revalidatePath("/admin/sets");
  revalidatePath(`/subjects/${subjectId}`);
  return r;
}

// ---------------- 묶음 ----------------

export async function createCollectionAction(input: { subjectId: string; parentId: string | null; title: string; scope: "shared" | "private" }): Promise<Result<Collection>> {
  const r = await collections.createCollection(await deps(), input);
  if (r.ok) revalidatePath(`/subjects/${input.subjectId}`);
  return r;
}

export async function renameCollectionAction(id: string, title: string): Promise<Result<void>> {
  return collections.renameCollection(await deps(), id, title);
}

export async function deleteCollectionAction(id: string): Promise<Result<void>> {
  return collections.deleteCollection(await deps(), id);
}

/** 퀴즈 결과·저장함 화면의 "묶음에 추가" */
export async function addToCollectionAction(collectionId: string, questionIds: string[]): Promise<Result<number>> {
  return collections.addToCollection(await deps(), collectionId, questionIds);
}

export async function removeFromCollectionAction(collectionId: string, questionId: string): Promise<Result<void>> {
  return collections.removeFromCollection(await deps(), collectionId, questionId);
}

/** 사용자가 쓸 수 있는 묶음 목록 (공용 + 내 것). 비로그인은 빈 목록 */
export async function listMyCollectionsAction(subjectId: string): Promise<Collection[]> {
  const r = await collections.myCollections(await deps(), subjectId);
  return r.ok ? r.data : [];
}

// ---------------- 반입 ----------------

/** 반입 1단계: 파일/텍스트 → 파싱 → 단원 배정 → 미리보기 데이터 */
export async function previewImportAction(formData: FormData): Promise<Result<ImportPreview>> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const bytes = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  return previewImport(await deps(), {
    subjectId: String(formData.get("subject_id") ?? ""),
    assignMode: String(formData.get("assign_mode") ?? "auto") === "manual" ? "manual" : "auto",
    targetUnitId: String(formData.get("target_unit_id") ?? "") || null,
    text: String(formData.get("text") ?? ""),
    answerText: String(formData.get("answer_text") ?? ""),
    files: bytes,
  });
}

/** 반입 2단계: 검증 → 통과한 문항 저장(같은 단원·질문은 덮어쓰기) → 실패 목록 */
export async function saveImportAction(input: { subjectId: string; title: string; sourceFilename: string | null; questions: PreviewQuestion[] }): Promise<Result<SaveSummary>> {
  const r = await commitImport(await deps(), input);
  if (!r.ok) return r;
  const { subjectIds, ...summary } = r.data;
  for (const sid of subjectIds) revalidatePath(`/subjects/${sid}`);
  revalidatePath("/admin");
  return { ok: true, data: summary };
}
