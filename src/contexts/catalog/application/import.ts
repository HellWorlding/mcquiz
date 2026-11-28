import { err, type Result } from "@/shared/result";
import type { Unit } from "../domain/types";
import { AUTHORING_GUIDE } from "../domain/import/authoring-guide";
import { confidenceFromScores, questionTokens, restrictCandidates, type UnitAssignment } from "../domain/import/classify";
import { findDuplicatePrompts, planImport } from "../domain/import/dedupe";
import { applyAnswerKey, parseRules } from "../domain/import/parse";
import { parseJsonQuestions } from "../domain/import/parse-json";
import { mergeAnswerKey, unitNoFromFilename } from "../domain/import/parse-text";
import { normalizeTarget, targetFromFilename, unitNoFromTitle, walkUnitPath, normalizeSubjectName } from "../domain/import/targets";
import { LOW_CONFIDENCE, type ParsedQuestion, type ParseResult, type PreviewQuestion } from "../domain/import/types";
import { needsReviewOf, validateQuestions, type FailedQuestion } from "../domain/question";
import { descendantIds, findUnitByNo, leafUnits, unitPathOf } from "../domain/unit";
import { attempt, requireAdmin } from "./guards";
import type { CatalogDeps, QuestionInsert } from "./ports";

export type ImportPreview = {
  questions: PreviewQuestion[];
  warnings: string[];
  format: string;
  suggestedTitle: string;
  sourceFilename: string | null;
  /** 파일이 과목을 지정한 경우: 과목 이름 → 문항 수 */
  subjectOverrides: Record<string, number>;
};

export type SaveSummary = { setId: string; count: number; inserted: number; updated: number; failed: FailedQuestion[] };

export type PreviewImportInput = {
  subjectId: string;
  files?: { name: string; bytes: Uint8Array }[];
  text?: string | null;
  /** 이미 파싱된 JSON (MCP 등). 문자열이면 그대로 파싱 */
  json?: unknown;
  answerText?: string | null;
  /** auto: 자동 분류 · manual: targetUnitId 에 모두 넣기 */
  assignMode?: "auto" | "manual";
  /** 자동 분류 때 상위 단원으로 후보를 제한, manual 때 배정 단원 */
  targetUnitId?: string | null;
};

const MAX_FILES = 60;

/** 규칙 파서 → (비면) AI 파서 → 정답지 병합 */
export async function parseWithFallback(deps: CatalogDeps, text: string, answerText: string | null, opts: { allowAI?: boolean } = {}): Promise<ParseResult> {
  let result = parseRules(text);
  if (result.questions.length === 0 && opts.allowAI !== false && deps.ai) {
    try {
      const ai = await deps.ai.parseQuestions(text);
      if (ai && ai.questions.length) result = ai;
    } catch (e) {
      result.warnings.push(`AI 파싱 실패: ${(e as Error).message}`);
    }
  }
  return applyAnswerKey(result, answerText);
}

/**
 * 문항 하나를 단원에 배정한다.
 * 1) 원문 단원 표시 → 2) Postgres 키워드 매칭(classify_unit) → 3) OpenAI (어댑터가 있고 신뢰도가 낮을 때)
 */
export async function classifyQuestion(
  deps: CatalogDeps,
  subjectId: string,
  units: Unit[],
  q: ParsedQuestion,
  opts: { preferParent?: string | null; useAI?: boolean } = {},
): Promise<UnitAssignment> {
  if (units.length === 0) return { unitId: null, confidence: null, candidates: [], method: "none" };
  // 상위 단원이 지정됐으면 번호 힌트·키워드·AI 모두 그 하위 단원 안에서만 고른다
  const allowed = opts.preferParent ? new Set(descendantIds(units, opts.preferParent)) : null;
  const pickable = allowed ? units.filter((u) => allowed.has(u.id)) : units;
  if (q.unitHint !== null) {
    const u = findUnitByNo(pickable, q.unitHint, opts.preferParent ?? null);
    if (u) return { unitId: u.id, confidence: 1, candidates: [{ unitId: u.id, score: 1 }], method: "hint" };
  }
  const tokens = questionTokens(q);
  let candidates = tokens.length > 0 ? await deps.units.classify(subjectId, tokens).catch(() => []) : [];
  candidates = restrictCandidates(candidates, allowed);
  const confidence = confidenceFromScores(candidates.map((c) => c.score));
  if (candidates.length > 0 && confidence >= LOW_CONFIDENCE) return { unitId: candidates[0].unitId, confidence, candidates, method: "keyword" };

  if ((opts.useAI ?? true) && deps.ai && pickable.length > 0) {
    try {
      const pool = candidates.slice(0, 3).map((c) => c.unitId);
      const ai = await deps.ai.classifyUnit({ subjectId, units: pickable, question: q, candidateUnitIds: pool });
      if (ai) return { unitId: ai.unitId, confidence: ai.confidence, candidates, method: "ai" };
    } catch (e) {
      // AI 는 보조 수단이다. 키 오류·네트워크 오류가 나도 키워드 결과로 계속 간다.
      console.warn("[classify] OpenAI 호출 실패, 키워드 결과 사용:", (e as Error).message);
    }
  }
  return { unitId: candidates[0]?.unitId ?? null, confidence: candidates.length ? confidence : null, candidates, method: candidates.length ? "keyword" : "none" };
}

/**
 * 단원 경로(["Collocation", "Part 3"])를 따라 내려가며 없는 단원은 만든다. 마지막 단원 id 를 돌려준다.
 * units 는 호출자가 미리 읽어 둔 목록이며, 새로 만든 단원은 여기에도 추가된다.
 */
export async function ensureUnitPath(deps: CatalogDeps, subjectId: string, path: string[], units: Unit[]): Promise<string | null> {
  const walked = walkUnitPath(units, subjectId, path);
  let parentId = walked.parentId;
  for (const title of walked.missing) {
    const no = unitNoFromTitle(title);
    const siblings = units.filter((u) => u.subjectId === subjectId && u.parentId === parentId);
    const sort = no ?? siblings.reduce((m, u) => Math.max(m, u.sort), 0) + 1;
    let created: Unit;
    try {
      created = await deps.units.insert({ subjectId, parentId, title, no, sort });
    } catch (e) {
      // 같은 번호가 이미 있으면(unique, C3) 번호 없이 다시 시도
      if (no === null) throw new Error(`단원 "${title}" 생성 실패: ${(e as Error).message}`);
      try {
        created = await deps.units.insert({ subjectId, parentId, title, no: null, sort });
      } catch (e2) {
        throw new Error(`단원 "${title}" 생성 실패: ${(e2 as Error).message}`);
      }
    }
    units.push(created);
    parentId = created.id;
  }
  return parentId;
}

/** 과목 이름으로 과목을 찾고, 없으면(관리자) 공개 과목으로 만든다 */
async function resolveSubjectByName(deps: CatalogDeps, rawName: string, createIfMissing: boolean): Promise<{ id: string; name: string } | null> {
  const name = normalizeSubjectName(rawName);
  const found = await deps.subjects.byName(name);
  if (found) return found;
  if (!createIfMissing) return null;
  return deps.subjects.create(name, "public");
}

/** 반입 1단계: 파일/텍스트/JSON → 파싱 → 단원 배정 → 미리보기 (관리자) */
export async function previewImport(deps: CatalogDeps, input: PreviewImportInput): Promise<Result<ImportPreview>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const subjectId = input.subjectId;
  const files = input.files ?? [];
  const pasted = input.text ?? "";
  const jsonText = input.json === undefined || input.json === null ? "" : typeof input.json === "string" ? input.json : JSON.stringify(input.json);
  if (!subjectId) return err("과목을 선택하세요.");
  if (!pasted.trim() && !jsonText.trim() && files.length === 0) return err("문제 텍스트를 붙여 넣거나 파일을 올리세요.");
  if (files.length > MAX_FILES) return err(`파일은 한 번에 ${MAX_FILES}개까지 올릴 수 있습니다.`);

  return attempt(async () => {
    const units = await deps.units.list(subjectId);
    const warnings: string[] = [];
    const parsed: ParsedQuestion[] = [];
    let format = "none";
    let sourceFilename: string | null = null;

    // 정답지로 보이는 파일은 따로 모아 문제 파일에 병합한다
    const answerFiles = files.filter((f) => /정답|해설|answer|key/i.test(f.name));
    const questionFiles = files.filter((f) => !answerFiles.includes(f));
    let answerCombined = input.answerText ?? "";
    for (const f of answerFiles) answerCombined += "\n" + (await deps.extractText(f.name, f.bytes));

    let fileTitle: string | null = null;
    for (const f of questionFiles) {
      const text = await deps.extractText(f.name, f.bytes);
      const r = await parseWithFallback(deps, text, null);
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
      const r = await parseWithFallback(deps, pasted, null);
      parsed.push(...r.questions);
      warnings.push(...r.warnings);
      if (r.questions.length) format = r.format;
    }
    if (jsonText.trim()) {
      const r = parseJsonQuestions(jsonText);
      if (r.title && !fileTitle) fileTitle = r.title;
      parsed.push(...r.questions);
      warnings.push(...r.warnings);
      if (r.questions.length) format = r.format;
    }
    if (answerCombined.trim() && parsed.length) {
      const m = mergeAnswerKey(parsed, answerCombined);
      warnings.push(...m.warnings);
      if (m.merged === 0) warnings.push("정답지에서 정답을 찾지 못했습니다. 번호 형식을 확인하세요.");
    }
    if (parsed.length === 0) throw new Error("문항을 하나도 찾지 못했습니다. 형식을 확인하세요.");

    const questions: PreviewQuestion[] = [];
    const subjectOverrides: Record<string, number> = {};
    const subjectIdByName = new Map<string, string>();
    const unitsBySubject = new Map<string, Unit[]>([[subjectId, units]]);
    const unitsOf = async (sid: string) => {
      if (!unitsBySubject.has(sid)) unitsBySubject.set(sid, await deps.units.list(sid));
      return unitsBySubject.get(sid)!;
    };
    const assignMode = input.assignMode ?? "auto";
    const targetUnitId = input.targetUnitId ?? null;
    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      let unitId: string | null = null;
      let unitConfidence: number | null = null;
      let unitCandidates: UnitAssignment["candidates"] = [];
      // 파일이 과목/단원 경로를 지정한 문항: 그 과목으로 보내고 단원은 경로대로 (없으면 생성)
      if (q.subjectName || q.unitPath) {
        if (q.subjectName) {
          const t = normalizeTarget(q.subjectName, q.unitPath);
          q.subjectName = t.subject;
          q.unitPath = t.unitPath;
        }
        let sid = subjectId;
        if (q.subjectName) {
          if (!subjectIdByName.has(q.subjectName)) {
            const s = await resolveSubjectByName(deps, q.subjectName, true);
            if (!s) {
              warnings.push(`#${i + 1}: 과목 "${q.subjectName}" 를 찾지 못했습니다.`);
              continue;
            }
            subjectIdByName.set(q.subjectName, s.id);
          }
          sid = subjectIdByName.get(q.subjectName)!;
          subjectOverrides[q.subjectName] = (subjectOverrides[q.subjectName] ?? 0) + 1;
        }
        const uList = await unitsOf(sid);
        if (q.unitPath?.length) {
          unitId = await ensureUnitPath(deps, sid, q.unitPath, uList);
          unitConfidence = 1;
        } else {
          const a = await classifyQuestion(deps, sid, uList, q, { preferParent: null });
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
        const a = await classifyQuestion(deps, subjectId, units, q, { preferParent: targetUnitId });
        unitId = a.unitId;
        unitConfidence = a.confidence;
        unitCandidates = a.candidates;
      }
      questions.push({ ...q, key: `q${i}`, subjectId, unitId, unitConfidence, unitCandidates });
    }

    const suggestedTitle = fileTitle ?? sourceFilename?.split(",")[0]?.replace(/\.[a-z0-9]+$/i, "") ?? `붙여넣기 ${new Date().toLocaleDateString("ko-KR")}`;
    return { questions, warnings, format, suggestedTitle, sourceFilename, subjectOverrides };
  });
}

const toInsert = (sid: string, q: PreviewQuestion): QuestionInsert => ({
  subjectId: sid,
  unitId: q.unitId,
  unitConfidence: q.unitConfidence,
  prompt: q.prompt,
  choices: q.choices.slice(0, 5).map((c, j) => ({ ord: j + 1, text: c.text, explanation: c.explanation })),
  correct: q.correct,
  explanation: q.explanation,
  hint: q.hint,
  tags: q.tags,
  points: q.points,
  topic: q.topic,
  difficulty: q.difficulty,
  trapTypes: q.trapTypes,
  sourceQuote: q.sourceQuote,
  sourcePage: q.sourcePage,
  needsReview: needsReviewOf(q),
});

export type SaveResult = { setId: string; count: number; inserted: number; updated: number };

/**
 * C7. 한 과목의 문항을 저장한다. 같은 (과목, 단원, 질문) 문항이 이미 있으면 새로 만들지 않고 덮어쓴다(선지 포함).
 * 새 문항은 이번 세트에 들어가고, 덮어쓴 문항은 원래 세트에 그대로 남는다.
 */
export async function saveQuestionSet(
  deps: CatalogDeps,
  input: { subjectId: string; title: string; sourceFilename: string | null; createdBy: string | null; questions: PreviewQuestion[] },
): Promise<SaveResult> {
  // 기존 문항 찾기 1: 같은 파일(source_filename)에서 온 같은 단원·같은 번호
  let byFilePos: { id: string; unitId: string | null; ord: number }[] = [];
  if (input.sourceFilename) {
    const setIds = await deps.sets.idsBySourceFilename(input.subjectId, input.sourceFilename);
    if (setIds.length) byFilePos = await deps.questions.findBySets(setIds);
  }
  // 기존 문항 찾기 2: (unit_id, prompt)
  const prompts = [...new Set(input.questions.map((q) => q.prompt))];
  const byPrompt: { id: string; unitId: string | null; prompt: string }[] = [];
  for (let i = 0; i < prompts.length; i += 100) byPrompt.push(...(await deps.questions.findByPrompts(input.subjectId, prompts.slice(i, i + 100))));

  const plan = planImport(input.questions, { byFilePos, byPrompt });
  // created_by 는 profiles FK. UUID 가 아닌 가짜 사용자(CLI 의 "service") 면 null
  const createdBy = input.createdBy && /^[0-9a-f-]{36}$/i.test(input.createdBy) ? input.createdBy : null;
  // 세트 생성·새 문항·덮어쓰기를 한 번에(원자적으로) 적용한다. 새 문항이 없으면 세트는 만들지 않고, 첫 덮어쓴 문항의 세트로 안내한다
  const r = await deps.questions.applyImport({
    subjectId: input.subjectId,
    set: { id: null, title: input.title, sourceFilename: input.sourceFilename, createdBy },
    inserts: plan.toInsert.map((q, i) => ({ ...toInsert(input.subjectId, q), ord: q.no ?? i + 1 })),
    updates: plan.toUpdate.map(({ id, q }) => ({ id, q: toInsert(input.subjectId, q) })),
  });
  return { setId: r.setId ?? "", count: r.inserted + r.updated, inserted: r.inserted, updated: r.updated };
}

/** 반입 2단계: 검증 → 통과한 문항 저장(같은 단원·질문은 덮어쓰기) → 실패 목록 (관리자) */
export async function commitImport(
  deps: CatalogDeps,
  input: { subjectId: string; title: string; sourceFilename: string | null; questions: PreviewQuestion[] },
): Promise<Result<SaveSummary & { subjectIds: string[] }>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const title = input.title.trim();
  if (!title) return err("세트 이름을 입력하세요.");
  const { valid, failed } = validateQuestions(input.questions);
  if (valid.length === 0) return err(`저장할 수 있는 문항이 없습니다. ${failed.map((f) => `#${f.index + 1} ${f.reason}`).join(" / ")}`);
  return attempt(async () => {
    // 파일이 과목을 지정한 문항은 그 과목으로, 나머지는 화면에서 고른 과목으로. 서로 섞이지 않는다.
    const bySubject = new Map<string, PreviewQuestion[]>();
    for (const q of valid) {
      const sid = q.subjectId ?? input.subjectId;
      bySubject.set(sid, [...(bySubject.get(sid) ?? []), q]);
    }
    let setId = "";
    let count = 0, inserted = 0, updated = 0;
    for (const [sid, qs] of bySubject) {
      const r = await saveQuestionSet(deps, { subjectId: sid, title, sourceFilename: input.sourceFilename, createdBy: g.data.id, questions: qs });
      if (!setId) setId = r.setId;
      count += r.count; inserted += r.inserted; updated += r.updated;
    }
    return { setId, count, inserted, updated, failed, subjectIds: [...bySubject.keys()] };
  });
}

export type ImportReport = {
  mode: "check" | "commit";
  received: number;
  valid: number;
  failed: number;
  duplicates_with_existing: number;
  problems: string[];
  duplicates: string[];
  next?: string;
  results?: { subject: string; inserted: number; updated: number }[];
};

/**
 * 외부(MCP) 반입: JSON 문항 배열 → 과목·단원 경로로 배정 → check 는 검사만, commit 은 저장.
 * 없는 과목은 만들지 않는다. check 모드에서는 단원도 만들지 않는다.
 */
export async function importQuestions(deps: CatalogDeps, input: { questions: unknown[]; mode: "check" | "commit"; setTitle?: string }): Promise<Result<ImportReport>> {
  const g = requireAdmin(deps);
  if (!g.ok) return err("문항 넣기는 관리자 계정만 할 수 있습니다.");
  const parsed = parseJsonQuestions(JSON.stringify(input.questions));
  if (parsed.questions.length === 0) return err(`문항을 읽지 못했습니다: ${parsed.warnings.join("; ") || "형식을 확인하세요"}`);
  return attempt(async () => {
    const subjects = await deps.subjects.list({ publicOnly: false });
    const subjectByName = new Map(subjects.map((s) => [s.name, s.id]));
    const unitsCache = new Map<string, Unit[]>();
    const preview: PreviewQuestion[] = [];
    const problems: string[] = [];
    for (let i = 0; i < parsed.questions.length; i++) {
      const q = parsed.questions[i];
      const t = normalizeTarget(q.subjectName, q.unitPath);
      const sid = t.subject ? subjectByName.get(t.subject) : null;
      if (!sid) {
        problems.push(`#${i + 1}: 과목 "${t.subject ?? "(없음)"}" 을 찾을 수 없습니다. list_subjects 의 이름을 그대로 쓰세요.`);
        continue;
      }
      if (!t.unitPath?.length) {
        problems.push(`#${i + 1}: unit_path 가 없습니다.`);
        continue;
      }
      if (!unitsCache.has(sid)) unitsCache.set(sid, await deps.units.list(sid));
      const units = unitsCache.get(sid)!;
      let unitId: string | null = null;
      if (input.mode === "commit") unitId = await ensureUnitPath(deps, sid, t.unitPath, units);
      else {
        const w = walkUnitPath(units, sid, t.unitPath);
        unitId = w.missing.length ? null : w.parentId;
        if (!unitId) problems.push(`#${i + 1}: 단원 ${JSON.stringify(t.unitPath)} 은 새로 만들어집니다 (기존 단원이면 이름을 글자까지 맞추세요).`);
      }
      preview.push({ ...q, key: `q${i}`, subjectId: sid, unitId, unitConfidence: 1, unitCandidates: [] });
    }
    // 정답이 없거나 파서 경고가 있는 문항은 넣지 않는다
    const noAnswer = new Set(preview.filter((q) => q.correct === null).map((q) => q.key));
    for (const q of preview) {
      const i = Number(q.key.slice(1)) + 1;
      if (noAnswer.has(q.key)) problems.push(`#${i}: 정답(correct_choice)이 없거나 선지 범위를 벗어납니다 — ${q.prompt.slice(0, 40)}`);
      for (const w of q.warnings) if (!w.startsWith("정답이 없습니다")) problems.push(`#${i}: ${w}`);
    }
    const { valid, failed } = validateQuestions(preview.filter((q) => !noAnswer.has(q.key)));
    for (const f of failed) problems.push(`#${f.index + 1}: ${f.reason} — ${f.prompt.slice(0, 40)}`);
    // 중복: 같은 과목에 질문문이 같은 문항 (C7)
    const duplicates: string[] = [];
    for (const sid of new Set(valid.map((q) => q.subjectId!))) {
      const mine = valid.filter((q) => q.subjectId === sid);
      const existing: string[] = [];
      for (let i = 0; i < mine.length; i += 50) existing.push(...(await deps.questions.findByPrompts(sid, mine.slice(i, i + 50).map((q) => q.prompt))).map((r) => r.prompt));
      duplicates.push(...findDuplicatePrompts(mine, existing));
    }
    const report: ImportReport = { mode: input.mode, received: input.questions.length, valid: valid.length, failed: failed.length + noAnswer.size, duplicates_with_existing: duplicates.length, problems, duplicates };
    if (input.mode === "check") {
      return { ...report, next: problems.length === 0 && duplicates.length === 0 ? "문제 없음. mode=commit 으로 다시 부르면 넣습니다." : "위 문제를 고친 뒤 다시 check 하세요. 중복 문항은 commit 시 같은 단원이면 덮어쓰고, 다른 단원이면 새로 들어갑니다." };
    }
    if (valid.length === 0) throw new Error("넣을 수 있는 문항이 없습니다.");
    const results: { subject: string; inserted: number; updated: number }[] = [];
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    for (const sid of new Set(valid.map((q) => q.subjectId!))) {
      const r = await saveQuestionSet(deps, { subjectId: sid, title: input.setTitle ?? `MCP ${stamp}`, sourceFilename: null, createdBy: g.data.id, questions: valid.filter((q) => q.subjectId === sid) });
      results.push({ subject: subjects.find((s) => s.id === sid)?.name ?? sid, inserted: r.inserted, updated: r.updated });
    }
    return { ...report, results };
  });
}

/** 출제 형식 안내. subjectId 를 주면 그 과목의 기존 단원 경로와 실제 문항 예시를 덧붙인다 */
export async function authoringGuide(deps: CatalogDeps, subjectId?: string): Promise<string> {
  if (!subjectId) return AUTHORING_GUIDE;
  const [subject, units] = await Promise.all([deps.subjects.byId(subjectId, { publicOnly: deps.user === null }), deps.units.list(subjectId)]);
  if (!subject) return AUTHORING_GUIDE;
  let extra = `\n## 이 과목의 기존 단원 경로 (subject = "${subject.name}")\n\n${leafUnits(units)
    .map((u) => `- ${JSON.stringify(unitPathOf(units, u.id))}`)
    .sort()
    .join("\n")}\n`;
  const sample = await deps.questions.sampleOf(subjectId);
  if (sample) {
    const ex = {
      subject: subject.name,
      unit_path: unitPathOf(units, sample.unitId),
      no: 1,
      prompt: sample.prompt,
      topic: sample.topic,
      difficulty: sample.difficulty,
      trap_types: sample.trapTypes,
      correct_choice: sample.correctChoice,
      explanation: sample.explanation,
      hint: sample.hint,
      source_quote: sample.sourceQuote,
      source_page: sample.sourcePage,
      choices: sample.choices.map((c) => ({ ord: c.ord, text: c.text })),
    };
    extra += `\n## 이 과목의 실제 문항 예시\n\n\`\`\`json\n${JSON.stringify(ex, null, 2)}\n\`\`\`\n`;
  }
  return AUTHORING_GUIDE + extra;
}

export { AUTHORING_GUIDE };
