"use server";
import { revalidatePath } from "next/cache";
import { getLang } from "@/shared/i18n/server";
import { err, type Result } from "@/shared/result";
import type { Evidence } from "../domain/search";
import { toSourceKind } from "../domain/source";
import { sortTocFirst } from "../domain/toc";
import { chat, chatContext, type ChatContext, type ChatInput, type ChatReply } from "../application/chat";
import { deleteSource, registerSources, type RegisterResult } from "../application/register-source";
import { findEvidence } from "../application/search";
import { sessionKnowledgeDeps } from "./deps";

const MAX_FILES = 60;

/** 문항의 정답 근거를 단원 자료(스크립트·책)에서 찾는다 */
export async function findEvidenceAction(questionId: string): Promise<Result<Evidence>> {
  return findEvidence(await sessionKnowledgeDeps(), questionId);
}

/** 챗봇 한 턴. 언어는 요청 쿠키(lang)를 따른다 */
export async function chatAction(input: Omit<ChatInput, "lang">): Promise<Result<ChatReply>> {
  const [deps, lang] = await Promise.all([sessionKnowledgeDeps(), getLang()]);
  return chat(deps, { ...input, lang });
}

/** 채팅 모달을 열 때: 남은 횟수, 과목의 AI 모드, AI 켜짐 여부, 이 문항으로 전에 나눈 대화 */
export async function openChatAction(subjectId: string, questionId: string | null): Promise<Result<ChatContext>> {
  return chatContext(await sessionKnowledgeDeps(), subjectId, questionId);
}

/** /admin/sources: 스크립트·노트·책·목차 파일 일괄 등록 */
export async function uploadSourcesAction(formData: FormData): Promise<Result<RegisterResult[]>> {
  const subjectId = String(formData.get("subject_id") ?? "");
  const kind = toSourceKind(String(formData.get("kind") ?? "script"));
  const parentUnitId = String(formData.get("parent_unit_id") ?? "") || null;
  const unitId = String(formData.get("unit_id") ?? "") || null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!subjectId) return err("주제를 선택하세요.");
  if (files.length === 0) return err("파일을 선택하세요.");
  if (files.length > MAX_FILES) return err(`파일은 한 번에 ${MAX_FILES}개까지 올릴 수 있습니다.`);
  const deps = await sessionKnowledgeDeps();
  const inputs: { filename: string; bytes: Uint8Array }[] = [];
  for (const f of sortTocFirst(files, (x) => x.name)) inputs.push({ filename: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  const r = await registerSources(deps, inputs, { subjectId, kind, unitId, parentUnitId });
  revalidatePath("/admin/sources");
  revalidatePath("/admin/units");
  return r;
}

export async function deleteSourceAction(id: string): Promise<Result<void>> {
  const r = await deleteSource(await sessionKnowledgeDeps(), id);
  revalidatePath("/admin/sources");
  return r;
}
