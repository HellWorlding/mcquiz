import type { Db, Update } from "@/shared/db/types";
import { allRows } from "@/shared/paginate";
import type { QuestionInsert, QuestionRepo } from "../../application/ports";
import { check, toQuestion } from "./mappers";

const row = (q: QuestionInsert) => ({
  subject_id: q.subjectId,
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
const choiceRows = (questionId: string, q: QuestionInsert) => q.choices.map((c) => ({ question_id: questionId, ord: c.ord, text: c.text, explanation: c.explanation }));

export function questionRepo(db: Db): QuestionRepo {
  const t = () => db.schema("catalog").from("questions");
  const choices = () => db.schema("catalog").from("choices");
  const sets = () => db.schema("catalog").from("question_sets");
  return {
    async byIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await t().select("*, choices(*)").in("id", ids);
      if (error) throw new Error(error.message);
      return (data ?? []).map(toQuestion);
    },
    async idsBySet(setId) {
      const { data } = await t().select("id").eq("set_id", setId).order("ord");
      return (data ?? []).map((r) => r.id);
    },
    async idsInUnits(subjectId, unitIds) {
      const rows = await allRows<{ id: string; unit_id: string | null }>((f, to) =>
        t().select("id, unit_id").eq("subject_id", subjectId).in("unit_id", unitIds).order("set_id").order("ord").range(f, to),
      );
      return rows.map((r) => ({ id: r.id, unitId: r.unit_id }));
    },
    async idsInSubject(subjectId) {
      const rows = await allRows<{ id: string }>((f, to) => t().select("id").eq("subject_id", subjectId).order("set_id").order("ord").range(f, to));
      return rows.map((r) => r.id);
    },
    async search(subjectId, text, limit) {
      const pat = `%${text.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const { data, error } = await t().select("id, unit_id, ord, prompt, topic").eq("subject_id", subjectId).or(`prompt.ilike.${pat},explanation.ilike.${pat}`).limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((q) => ({ id: q.id, unitId: q.unit_id, ord: q.ord, prompt: q.prompt, topic: q.topic }));
    },
    async findByPrompts(subjectId, prompts) {
      if (prompts.length === 0) return [];
      const { data, error } = await t().select("id, unit_id, prompt").eq("subject_id", subjectId).in("prompt", prompts);
      // 조회 실패를 "기존 문항 없음" 으로 보면 전부 새 문항으로 저장돼 중복이 생긴다 → 반입을 멈춘다
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id, unitId: r.unit_id, prompt: r.prompt }));
    },
    async findBySets(setIds) {
      if (setIds.length === 0) return [];
      const { data, error } = await t().select("id, unit_id, ord").in("set_id", setIds);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id, unitId: r.unit_id, ord: r.ord }));
    },
    async sampleOf(subjectId) {
      const { data } = await t().select("*, choices(*)").eq("subject_id", subjectId).limit(1).maybeSingle();
      return data ? toQuestion(data) : null;
    },
    async update(id, patch) {
      const p: Update<"catalog", "questions"> = {};
      if (patch.prompt !== undefined) p.prompt = patch.prompt;
      if (patch.unitId !== undefined) p.unit_id = patch.unitId;
      if (patch.unitConfidence !== undefined) p.unit_confidence = patch.unitConfidence;
      if (patch.correctChoice !== undefined) p.correct_choice = patch.correctChoice;
      if (patch.needsReview !== undefined) p.needs_review = patch.needsReview;
      if (patch.explanation !== undefined) p.explanation = patch.explanation;
      if (patch.hint !== undefined) p.hint = patch.hint;
      if (patch.tags !== undefined) p.tags = patch.tags;
      check(await t().update(p).eq("id", id));
    },
    async updateChoice(questionId, ord, patch) {
      const p: Update<"catalog", "choices"> = {};
      if (patch.text !== undefined) p.text = patch.text;
      if (patch.explanation !== undefined) p.explanation = patch.explanation;
      check(await choices().update(p).eq("question_id", questionId).eq("ord", ord));
    },
    async delete(id) {
      check(await t().delete().eq("id", id));
    },
    async overwrite(id, q) {
      check(await t().update(row(q)).eq("id", id));
      check(await choices().delete().eq("question_id", id));
      check(await choices().insert(choiceRows(id, q)));
    },
    async insertIntoSet(setId, rows) {
      const inserted = await t()
        .insert(rows.map((q) => ({ ...row(q), set_id: setId, ord: q.ord })))
        .select("id, ord");
      if (inserted.error || !inserted.data) {
        await sets().delete().eq("id", setId);
        throw new Error(inserted.error?.message ?? "문항 저장 실패");
      }
      const idByOrd = new Map(inserted.data.map((r) => [r.ord, r.id]));
      const all = rows.flatMap((q) => choiceRows(idByOrd.get(q.ord)!, q));
      const c = await choices().insert(all);
      if (c.error) {
        await sets().delete().eq("id", setId);
        throw new Error(c.error.message);
      }
    },
    async setIdOf(questionId) {
      const { data } = await t().select("set_id").eq("id", questionId).maybeSingle();
      return data?.set_id ?? null;
    },
  };
}

