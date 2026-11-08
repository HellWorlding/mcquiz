import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import type { PreviewQuestion } from "./types";

type Db = SupabaseClient<Database>;

/** 미리보기에서 확정한 문항들을 세트 하나로 저장한다 */
export async function saveQuestionSet(
  db: Db,
  input: {
    subjectId: string;
    title: string;
    sourceFilename: string | null;
    createdBy: string | null;
    questions: PreviewQuestion[];
  },
): Promise<{ setId: string; count: number }> {
  const { data: set, error: setErr } = await db
    .from("question_sets")
    .insert({
      subject_id: input.subjectId,
      title: input.title,
      source_filename: input.sourceFilename,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (setErr || !set) throw new Error(setErr?.message ?? "세트를 만들지 못했습니다");

  const rows = input.questions.map((q, i) => ({
    set_id: set.id,
    subject_id: input.subjectId,
    unit_id: q.unitId,
    unit_confidence: q.unitConfidence,
    ord: i + 1,
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
    needs_review: q.correct === null,
  }));
  const { data: inserted, error: qErr } = await db.from("questions").insert(rows).select("id, ord");
  if (qErr || !inserted) {
    await db.from("question_sets").delete().eq("id", set.id);
    throw new Error(qErr?.message ?? "문항 저장 실패");
  }
  const idByOrd = new Map(inserted.map((r) => [r.ord, r.id]));
  const choiceRows = input.questions.flatMap((q, i) =>
    q.choices.slice(0, 5).map((c, j) => ({
      question_id: idByOrd.get(i + 1)!,
      ord: j + 1,
      text: c.text,
      explanation: c.explanation,
    })),
  );
  const { error: cErr } = await db.from("choices").insert(choiceRows);
  if (cErr) {
    await db.from("question_sets").delete().eq("id", set.id);
    throw new Error(cErr.message);
  }
  return { setId: set.id, count: rows.length };
}
