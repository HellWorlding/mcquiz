"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/domains/auth/supabase/server";
import { requireAdmin } from "@/domains/auth/session";
import type { ActionResult, Unit } from "@/domains/shared/types";
import { classifyQuestion } from "./classify";
import { parseAny } from "./parse";
import { unitNoFromFilename } from "./parse-text";
import { saveQuestionSet } from "./save";
import { extractText, importSourceFile, type SourceUploadResult } from "./sources";
import type { ParsedQuestion, PreviewQuestion } from "./types";

export type PreviewResult = {
  questions: PreviewQuestion[];
  warnings: string[];
  format: string;
  suggestedTitle: string;
  sourceFilename: string | null;
};

const MAX_FILES = 60;

/** 업로드 1단계: 파일/텍스트 → 파싱 → 단원 배정 → 미리보기 데이터 */
export async function previewImportAction(formData: FormData): Promise<ActionResult<PreviewResult>> {
  await requireAdmin();
  const subjectId = String(formData.get("subject_id") ?? "");
  const assignMode = String(formData.get("assign_mode") ?? "auto"); // auto | manual
  const targetUnitId = String(formData.get("target_unit_id") ?? "") || null;
  const pasted = String(formData.get("text") ?? "");
  const answerText = String(formData.get("answer_text") ?? "");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!subjectId) return { ok: false, error: "주제를 선택하세요." };
  if (!pasted.trim() && files.length === 0) return { ok: false, error: "문제 텍스트를 붙여 넣거나 파일을 올리세요." };
  if (files.length > MAX_FILES) return { ok: false, error: `파일은 한 번에 ${MAX_FILES}개까지 올릴 수 있습니다.` };

  const db = await createClient();
  const { data: unitsData } = await db.from("units").select("*").eq("subject_id", subjectId);
  const units: Unit[] = unitsData ?? [];

  const warnings: string[] = [];
  const parsed: ParsedQuestion[] = [];
  let format = "none";
  let sourceFilename: string | null = null;

  // 정답지로 보이는 파일은 따로 모아 문제 파일에 병합한다
  const answerFiles = files.filter((f) => /정답|해설|answer|key/i.test(f.name));
  const questionFiles = files.filter((f) => !answerFiles.includes(f));
  let answerCombined = answerText;
  for (const f of answerFiles) {
    const { text } = await extractText(f.name, new Uint8Array(await f.arrayBuffer()));
    answerCombined += "\n" + text;
  }

  for (const f of questionFiles) {
    const { text } = await extractText(f.name, new Uint8Array(await f.arrayBuffer()));
    const r = await parseAny(text, null);
    const fileUnit = unitNoFromFilename(f.name);
    for (const q of r.questions) if (q.unitHint === null && fileUnit !== null) q.unitHint = fileUnit;
    parsed.push(...r.questions);
    warnings.push(...r.warnings.map((w) => `${f.name}: ${w}`));
    if (r.questions.length) format = r.format;
    if (r.questions.length === 0) warnings.push(`${f.name}: 문항을 찾지 못했습니다.`);
    sourceFilename = sourceFilename ? `${sourceFilename}, ${f.name}` : f.name;
  }
  if (pasted.trim()) {
    const r = await parseAny(pasted, null);
    parsed.push(...r.questions);
    warnings.push(...r.warnings);
    if (r.questions.length) format = r.format;
  }
  if (answerCombined.trim() && parsed.length) {
    const { mergeAnswerKey } = await import("./parse-text");
    const m = mergeAnswerKey(parsed, answerCombined);
    warnings.push(...m.warnings);
    if (m.merged === 0) warnings.push("정답지에서 정답을 찾지 못했습니다. 번호 형식을 확인하세요.");
  }
  if (parsed.length === 0) return { ok: false, error: "문항을 하나도 찾지 못했습니다. 형식을 확인하세요." };

  const questions: PreviewQuestion[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    let unitId: string | null = null;
    let unitConfidence: number | null = null;
    let unitCandidates: { unitId: string; score: number }[] = [];
    if (assignMode === "manual" && targetUnitId) {
      unitId = targetUnitId;
      unitConfidence = 1;
    } else {
      const a = await classifyQuestion(db, subjectId, units, q, { preferParent: targetUnitId });
      unitId = a.unitId;
      unitConfidence = a.confidence;
      unitCandidates = a.candidates;
    }
    questions.push({ ...q, key: `q${i}`, unitId, unitConfidence, unitCandidates });
  }

  const suggestedTitle =
    sourceFilename?.split(",")[0]?.replace(/\.[a-z0-9]+$/i, "") ??
    `붙여넣기 ${new Date().toLocaleDateString("ko-KR")}`;
  return { ok: true, data: { questions, warnings, format, suggestedTitle, sourceFilename } };
}

/** 업로드 2단계: 미리보기에서 수정한 문항을 저장 */
export async function saveImportAction(input: {
  subjectId: string;
  title: string;
  sourceFilename: string | null;
  questions: PreviewQuestion[];
}): Promise<ActionResult<{ setId: string; count: number }>> {
  const user = await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "세트 이름을 입력하세요." };
  const questions = input.questions.filter((q) => q.prompt.trim());
  if (questions.length === 0) return { ok: false, error: "저장할 문항이 없습니다." };
  for (const q of questions) {
    q.prompt = q.prompt.trim();
    q.choices = q.choices.map((c) => ({ text: c.text.trim(), explanation: c.explanation?.trim() || null }));
    if (q.choices.length < 4 || q.choices.length > 5) {
      return { ok: false, error: `"${q.prompt.slice(0, 20)}…" 문항의 선지는 4개 또는 5개여야 합니다.` };
    }
  }
  const db = await createClient();
  try {
    const r = await saveQuestionSet(db, {
      subjectId: input.subjectId,
      title,
      sourceFilename: input.sourceFilename,
      createdBy: user.id,
      questions,
    });
    revalidatePath(`/subjects/${input.subjectId}`);
    revalidatePath("/admin");
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** /admin/sources: 스크립트·노트·책·목차 파일 일괄 업로드 */
export async function uploadSourcesAction(formData: FormData): Promise<ActionResult<SourceUploadResult[]>> {
  await requireAdmin();
  const subjectId = String(formData.get("subject_id") ?? "");
  const kindRaw = String(formData.get("kind") ?? "script");
  const kind = (["script", "note", "book", "other"] as const).find((k) => k === kindRaw) ?? "script";
  const parentUnitId = String(formData.get("parent_unit_id") ?? "") || null;
  const unitId = String(formData.get("unit_id") ?? "") || null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!subjectId) return { ok: false, error: "주제를 선택하세요." };
  if (files.length === 0) return { ok: false, error: "파일을 선택하세요." };
  if (files.length > MAX_FILES) return { ok: false, error: `파일은 한 번에 ${MAX_FILES}개까지 올릴 수 있습니다.` };

  const db = await createClient();
  const results: SourceUploadResult[] = [];
  // 목차 파일을 먼저 처리해야 나머지 파일이 단원에 연결된다
  const sorted = [...files].sort((a, b) => (/목차|toc/i.test(b.name) ? 1 : 0) - (/목차|toc/i.test(a.name) ? 1 : 0));
  for (const f of sorted) {
    const { data: unitsData } = await db.from("units").select("*").eq("subject_id", subjectId);
    try {
      results.push(
        await importSourceFile(db, {
          subjectId,
          filename: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
          kind,
          units: unitsData ?? [],
          unitId,
          parentUnitId,
        }),
      );
    } catch (e) {
      results.push({ filename: f.name, status: "skipped", message: (e as Error).message });
    }
  }
  revalidatePath("/admin/sources");
  revalidatePath("/admin/units");
  return { ok: true, data: results };
}

export async function deleteSourceAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const { error } = await db.from("sources").delete().eq("id", id);
  revalidatePath("/admin/sources");
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}
