"use server";
import type { Result } from "@/shared/result";
import { cookies } from "next/headers";
import { GUEST_TRIAL_COOKIE, trialCookieValue } from "../domain/guest";
import type { Collection } from "@/contexts/catalog";
import { sessionCatalogApi, sessionLearningDeps } from "../infrastructure/session-deps";
import { deleteSession, recordAttempt, saveProgress, toggleConfused, type RecordAttemptInput, type SaveProgressInput } from "../application/quiz";
import { dismiss, markSaved, undismiss } from "../application/saved-box";
import { saveNote } from "../application/notes";
import { exportSavedBox, type SavedExportResult } from "../application/export";

/** 답을 고르면 attempts 에 기록한다. 게스트는 저장하지 않고 null */
export async function recordAttemptAction(input: RecordAttemptInput): Promise<Result<string | null>> {
  return recordAttempt(await sessionLearningDeps(), input);
}

export async function setConfusedAction(attemptId: string, confused: boolean): Promise<Result<void>> {
  return toggleConfused(await sessionLearningDeps(), attemptId, confused);
}

/** 퀴즈 진행 상태 저장. sessionId 가 없으면 새로 만들고 id 를 돌려준다 */
export async function saveProgressAction(input: SaveProgressInput): Promise<Result<string | null>> {
  return saveProgress(await sessionLearningDeps(), input);
}

export async function deleteSessionAction(sessionId: string): Promise<Result<void>> {
  return deleteSession(await sessionLearningDeps(), sessionId);
}

/** 저장함에서 빼기 (한 개) */
export async function dismissQuestionAction(questionId: string): Promise<Result<void>> {
  const r = await dismiss(await sessionLearningDeps(), [questionId]);
  return r.ok ? { ok: true, data: undefined } : r;
}

/** 저장함에서 여러 개 한 번에 빼기 */
export async function dismissQuestionsAction(questionIds: string[]): Promise<Result<number>> {
  return dismiss(await sessionLearningDeps(), questionIds);
}

/** 방금 뺀 문항 되돌리기 */
export async function undismissQuestionsAction(questionIds: string[]): Promise<Result<number>> {
  return undismiss(await sessionLearningDeps(), questionIds);
}

/** 문항 직접 저장 / 저장 취소 */
export async function saveQuestionAction(questionId: string, saved: boolean): Promise<Result<void>> {
  return markSaved(await sessionLearningDeps(), questionId, saved);
}

/** 저장함 내보내기: JSON·Markdown 문자열 */
export async function exportSavedAction(subjectId: string, questionIds: string[], filterLabel: string | null): Promise<Result<SavedExportResult>> {
  return exportSavedBox(await sessionLearningDeps(), { subjectId, questionIds, filterLabel });
}

/** 문항 메모 저장. 비우면 삭제 */
export async function saveNoteAction(questionId: string, content: string): Promise<Result<"saved" | "deleted" | "guest">> {
  return saveNote(await sessionLearningDeps(), questionId, content);
}

// ---- 풀이·저장함 화면이 부르는 Catalog 묶음(Collection) 액션. Catalog 공개 API 를 세션으로 감싼 것 ----

export async function listMyCollectionsAction(subjectId: string): Promise<Collection[]> {
  const r = await (await sessionCatalogApi()).myCollections(subjectId);
  return r.ok ? r.data : [];
}
export async function createCollectionAction(input: { subjectId: string; parentId: string | null; title: string; scope: "shared" | "private" }): Promise<Result<Collection>> {
  return (await sessionCatalogApi()).createCollection(input);
}
export async function deleteCollectionAction(id: string): Promise<Result<void>> {
  return (await sessionCatalogApi()).deleteCollection(id);
}
export async function addToCollectionAction(collectionId: string, questionIds: string[]): Promise<Result<number>> {
  return (await sessionCatalogApi()).addToCollection(collectionId, questionIds);
}

/** 게스트가 체험 문항을 다 풀면 오늘 날짜를 쿠키에 적어 하루 한 번만 체험하게 한다 (D-009) */
export async function markGuestTrialAction(quizKey: string): Promise<void> {
  (await cookies()).set(GUEST_TRIAL_COOKIE, trialCookieValue(new Date(), quizKey.slice(0, 32)), { path: "/", maxAge: 60 * 60 * 36, sameSite: "lax", httpOnly: true });
}
