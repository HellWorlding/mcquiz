import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import type { PreviewQuestion } from "./types";

type Db = SupabaseClient<Database>;

export type FailedQuestion = { index: number; prompt: string; reason: string };

/** 저장 전 검증. 통과한 문항과 실패 목록을 나눈다. */
export function validateQuestions(questions: PreviewQuestion[]): { valid: PreviewQuestion[]; failed: FailedQuestion[] } {
  const valid: PreviewQuestion[] = [];
  const failed: FailedQuestion[] = [];
  questions.forEach((q, index) => {
    const prompt = q.prompt.trim();
    const choices = q.choices.map((c) => ({ text: c.text.trim(), explanation: c.explanation?.trim() || null }));
    const reasons: string[] = [];
    if (!prompt) reasons.push("질문이 비어 있음");
    if (choices.length !== 4 && choices.length !== 5) reasons.push(`선지가 ${choices.length}개 (4개 또는 5개여야 함)`);
    if (choices.some((c) => !c.text || c.text === "(선지 없음)")) reasons.push("빈 선지가 있음");
    if (q.correct !== null && (q.correct < 1 || q.correct > choices.length)) reasons.push(`정답 번호 ${q.correct} 가 선지 범위를 벗어남`);
    if (reasons.length) failed.push({ index, prompt: prompt || "(질문 없음)", reason: reasons.join(", ") });
    else valid.push({ ...q, prompt, choices, explanation: q.explanation?.trim() || null, hint: q.hint?.trim() || null });
  });
  return { valid, failed };
}

export type SaveResult = { setId: string; count: number; inserted: number; updated: number };

/**
 * 문항을 저장한다. 같은 (주제, 단원, 질문) 문항이 이미 있으면 새로 만들지 않고 덮어쓴다(선지 포함).
 * 새 문항은 이번 세트에 들어가고, 덮어쓴 문항은 원래 세트에 그대로 남는다.
 */
export async function saveQuestionSet(
  db: Db,
  input: {
    subjectId: string;
    title: string;
    sourceFilename: string | null;
    createdBy: string | null;
    questions: PreviewQuestion[];
  },
): Promise<SaveResult> {
  // 기존 문항 찾기 1: 같은 파일(source_filename)에서 온 같은 단원·같은 번호 → 질문 문장이 바뀌어도 같은 문항
  const byFilePos = new Map<string, string>(); // `${unit_id}|${ord}` → id
  if (input.sourceFilename) {
    const { data: sets } = await db
      .from("question_sets")
      .select("id")
      .eq("subject_id", input.subjectId)
      .eq("source_filename", input.sourceFilename);
    const setIds = (sets ?? []).map((s) => s.id);
    if (setIds.length) {
      const { data } = await db.from("questions").select("id, unit_id, ord").in("set_id", setIds);
      for (const r of data ?? []) byFilePos.set(`${r.unit_id ?? ""}|${r.ord}`, r.id);
    }
  }
  // 기존 문항 찾기 2: (unit_id, prompt)
  const prompts = [...new Set(input.questions.map((q) => q.prompt))];
  const byPrompt = new Map<string, string>(); // `${unit_id}|${prompt}` → id
  for (let i = 0; i < prompts.length; i += 100) {
    const { data } = await db
      .from("questions")
      .select("id, unit_id, prompt")
      .eq("subject_id", input.subjectId)
      .in("prompt", prompts.slice(i, i + 100));
    for (const r of data ?? []) byPrompt.set(`${r.unit_id ?? ""}|${r.prompt}`, r.id);
  }

  const toInsert: PreviewQuestion[] = [];
  const toUpdate: { id: string; q: PreviewQuestion }[] = [];
  const used = new Set<string>();
  input.questions.forEach((q, i) => {
    const no = q.no ?? i + 1;
    const id = byFilePos.get(`${q.unitId ?? ""}|${no}`) ?? byPrompt.get(`${q.unitId ?? ""}|${q.prompt}`);
    if (id && !used.has(id)) {
      used.add(id);
      toUpdate.push({ id, q });
    } else {
      toInsert.push(q);
    }
  });

  const row = (q: PreviewQuestion) => ({
    subject_id: input.subjectId,
    unit_id: q.unitId,
    unit_confidence: q.unitConfidence,
    prompt: q.prompt,
    choice_count: q.choices.length === 5 ? 5 : 4,
    correct_choice: q.correct,
    explanation: q.explanation,
    hint: q.hint,
    tags: q.tags,
    points: q.points,
    topic: q.topic,
    difficulty: q.difficulty,
    trap_types: q.trapTypes,
    source_quote: q.sourceQuote,
    source_page: q.sourcePage,
    needs_review: q.correct === null,
  });
  const choiceRows = (questionId: string, q: PreviewQuestion) =>
    q.choices.slice(0, 5).map((c, j) => ({ question_id: questionId, ord: j + 1, text: c.text, explanation: c.explanation }));

  // 덮어쓰기
  for (const { id, q } of toUpdate) {
    const { error } = await db.from("questions").update(row(q)).eq("id", id);
    if (error) throw new Error(error.message);
    await db.from("choices").delete().eq("question_id", id);
    const { error: cErr } = await db.from("choices").insert(choiceRows(id, q));
    if (cErr) throw new Error(cErr.message);
  }

  // 새 문항은 세트 하나로
  let setId: string | null = null;
  if (toInsert.length) {
    const { data: set, error: setErr } = await db
      .from("question_sets")
      .insert({ subject_id: input.subjectId, title: input.title, source_filename: input.sourceFilename, created_by: input.createdBy })
      .select("id")
      .single();
    if (setErr || !set) throw new Error(setErr?.message ?? "세트를 만들지 못했습니다");
    setId = set.id;
    const rows = toInsert.map((q, i) => ({ ...row(q), set_id: set.id, ord: q.no ?? i + 1 }));
    const { data: inserted, error: qErr } = await db.from("questions").insert(rows).select("id, ord");
    if (qErr || !inserted) {
      await db.from("question_sets").delete().eq("id", set.id);
      throw new Error(qErr?.message ?? "문항 저장 실패");
    }
    const ordOf = (q: PreviewQuestion, i: number) => q.no ?? i + 1;
    const idByOrd = new Map(inserted.map((r) => [r.ord, r.id]));
    const allChoices = toInsert.flatMap((q, i) => choiceRows(idByOrd.get(ordOf(q, i))!, q));
    const { error: cErr } = await db.from("choices").insert(allChoices);
    if (cErr) {
      await db.from("question_sets").delete().eq("id", set.id);
      throw new Error(cErr.message);
    }
  } else if (toUpdate.length) {
    // 전부 덮어쓰기였으면 첫 문항의 세트로 안내
    const { data } = await db.from("questions").select("set_id").eq("id", toUpdate[0].id).single();
    setId = data?.set_id ?? null;
  }
  return { setId: setId ?? "", count: toInsert.length + toUpdate.length, inserted: toInsert.length, updated: toUpdate.length };
}
