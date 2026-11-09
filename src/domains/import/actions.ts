"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/domains/auth/supabase/server";
import { requireAdmin } from "@/domains/auth/session";
import type { ActionResult, Unit } from "@/domains/shared/types";
import { classifyQuestion } from "./classify";
import { parseAny } from "./parse";
import { unitNoFromFilename } from "./parse-text";
import { saveQuestionSet, validateQuestions, type FailedQuestion } from "./save";
import { extractText, importSourceFile, type SourceUploadResult } from "./sources";
import { ensureUnitPath, normalizeTarget, resolveSubjectByName, targetFromFilename } from "./targets";
import type { ParsedQuestion, PreviewQuestion } from "./types";

export type PreviewResult = {
  questions: PreviewQuestion[];
  warnings: string[];
  format: string;
  suggestedTitle: string;
  sourceFilename: string | null;
  /** 파일이 주제를 지정한 경우: 주제 이름 → 문항 수 */
  subjectOverrides: Record<string, number>;
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

  let fileTitle: string | null = null;
  for (const f of questionFiles) {
    const { text } = await extractText(f.name, new Uint8Array(await f.arrayBuffer()));
    const r = await parseAny(text, null);
    const fileUnit = unitNoFromFilename(f.name);
    const fromName = targetFromFilename(f.name);
    if (r.title && !fileTitle) fileTitle = r.title;
    for (const q of r.questions) {
      if (fromName && !q.subjectName) {
        q.subjectName = fromName.subject;
        if (!q.unitPath) q.unitPath = fromName.unitPath;
      }
      if (q.unitHint === null && fileUnit !== null && !q.subjectName) q.unitHint = fileUnit;
    }
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
  const subjectOverrides: Record<string, number> = {};
  const subjectIdByName = new Map<string, string>();
  const unitsBySubject = new Map<string, Unit[]>([[subjectId, units]]);
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    let unitId: string | null = null;
    let unitConfidence: number | null = null;
    let unitCandidates: { unitId: string; score: number }[] = [];
    // 파일이 주제/단원 경로를 지정한 문항: 그 주제로 보내고 단원은 경로대로 (없으면 생성)
    if (q.subjectName || q.unitPath) {
      if (q.subjectName) {
        const t = normalizeTarget(q.subjectName, q.unitPath);
        q.subjectName = t.subject;
        q.unitPath = t.unitPath;
      }
      let sid = subjectId;
      if (q.subjectName) {
        if (!subjectIdByName.has(q.subjectName)) {
          const s = await resolveSubjectByName(db, q.subjectName, { createIfMissing: true, visibility: "public" });
          if (!s) {
            warnings.push(`#${i + 1}: 주제 "${q.subjectName}" 를 찾지 못했습니다.`);
            continue;
          }
          subjectIdByName.set(q.subjectName, s.id);
        }
        sid = subjectIdByName.get(q.subjectName)!;
        subjectOverrides[q.subjectName] = (subjectOverrides[q.subjectName] ?? 0) + 1;
      }
      if (!unitsBySubject.has(sid)) {
        const { data } = await db.from("units").select("*").eq("subject_id", sid);
        unitsBySubject.set(sid, data ?? []);
      }
      const uList = unitsBySubject.get(sid)!;
      if (q.unitPath?.length) {
        unitId = await ensureUnitPath(db, sid, q.unitPath, uList);
        unitConfidence = 1;
      } else {
        const a = await classifyQuestion(db, sid, uList, q, { preferParent: null });
        unitId = a.unitId;
        unitConfidence = a.confidence;
        unitCandidates = a.candidates;
      }
      questions.push({ ...q, key: `q${i}`, subjectId: sid, unitId, unitConfidence, unitCandidates });
      continue;
    }
    if (assignMode === "manual" && targetUnitId) {
      unitId = targetUnitId;
      unitConfidence = 1;
    } else {
      const a = await classifyQuestion(db, subjectId, units, q, { preferParent: targetUnitId });
      unitId = a.unitId;
      unitConfidence = a.confidence;
      unitCandidates = a.candidates;
    }
    questions.push({ ...q, key: `q${i}`, subjectId, unitId, unitConfidence, unitCandidates });
  }

  const suggestedTitle =
    fileTitle ??
    sourceFilename?.split(",")[0]?.replace(/\.[a-z0-9]+$/i, "") ??
    `붙여넣기 ${new Date().toLocaleDateString("ko-KR")}`;
  return { ok: true, data: { questions, warnings, format, suggestedTitle, sourceFilename, subjectOverrides } };
}

export type SaveSummary = { setId: string; count: number; inserted: number; updated: number; failed: FailedQuestion[] };

/** 업로드 2단계: 검증 → 통과한 문항 저장(같은 단원·질문은 덮어쓰기) → 실패 목록 반환 */
export async function saveImportAction(input: {
  subjectId: string;
  title: string;
  sourceFilename: string | null;
  questions: PreviewQuestion[];
}): Promise<ActionResult<SaveSummary>> {
  const user = await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "세트 이름을 입력하세요." };
  const { valid, failed } = validateQuestions(input.questions);
  if (valid.length === 0) {
    return { ok: false, error: `저장할 수 있는 문항이 없습니다. ${failed.map((f) => `#${f.index + 1} ${f.reason}`).join(" / ")}` };
  }
  const db = await createClient();
  try {
    // 파일이 주제를 지정한 문항은 그 주제로, 나머지는 화면에서 고른 주제로. 서로 섞이지 않는다.
    const bySubject = new Map<string, PreviewQuestion[]>();
    for (const q of valid) {
      const sid = q.subjectId ?? input.subjectId;
      bySubject.set(sid, [...(bySubject.get(sid) ?? []), q]);
    }
    let setId = "";
    let count = 0, inserted = 0, updated = 0;
    for (const [sid, qs] of bySubject) {
      const r = await saveQuestionSet(db, { subjectId: sid, title, sourceFilename: input.sourceFilename, createdBy: user.id, questions: qs });
      if (!setId) setId = r.setId;
      count += r.count; inserted += r.inserted; updated += r.updated;
      revalidatePath(`/subjects/${sid}`);
    }
    revalidatePath("/admin");
    return { ok: true, data: { setId, count, inserted, updated, failed } };
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
