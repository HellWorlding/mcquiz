import type { Db, Update } from "@/shared/db/types";
import { allRows } from "@/shared/paginate";
import type { ImportWrite, QuestionInsert, QuestionRepo } from "../../application/ports";
import { encodeEnvelope } from "../envelope";
import { check, toQuestion } from "./mappers";

/** 문항 한 행 (catalog.apply_import 봉투 안의 모양 — snake_case 열 이름) */
const row = (q: QuestionInsert) => ({
  unit_id: q.unitId,
  unit_confidence: q.unitConfidence,
  prompt: q.prompt,
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
  needs_review: q.needsReview,
  choices: q.choices.map((c) => ({ ord: c.ord, text: c.text, explanation: c.explanation })),
});

/** 반입 계획 → 봉투 내용 (DB 함수가 받는 모양) */
export function importPayload(w: ImportWrite) {
  return {
    subject_id: w.subjectId,
    set: { id: w.set.id, title: w.set.title, source_filename: w.set.sourceFilename, created_by: w.set.createdBy },
    inserts: w.inserts.map((q) => ({ ...row(q), ord: q.ord })),
    updates: w.updates.map((u) => ({ id: u.id, ...row(u.q) })),
  };
}

export function questionRepo(db: Db): QuestionRepo {
  const t = () => db.schema("catalog").from("questions");
  const choices = () => db.schema("catalog").from("choices");
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
      // 질문문을 URL(?prompt=in.(…))에 싣지 않는다: 긴 본문은 "URI too long", SQL 문장은 WAF 에 막힌다 (D-020).
      // 과목의 (id, 단원, 질문문)을 쪽 단위로 읽어 여기서 정확히 같은 질문문만 고른다 — 예전 in() 과 같은 결과.
      // 조회 실패를 "기존 문항 없음" 으로 보면 전부 새 문항으로 저장돼 중복이 생긴다 → throw 해 반입을 멈춘다 (allRows 는 오류를 삼키므로 쓰지 않는다)
      const wanted = new Set(prompts);
      const out: { id: string; unitId: string | null; prompt: string }[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await t().select("id, unit_id, prompt").eq("subject_id", subjectId).order("id").range(from, from + page - 1);
        if (error) throw new Error(error.message);
        for (const r of data ?? []) if (wanted.has(r.prompt)) out.push({ id: r.id, unitId: r.unit_id, prompt: r.prompt });
        if (!data || data.length < page) break;
      }
      return out;
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
    async applyImport(w) {
      // 본문(SQL 문장·HTML)이 WAF 에 막히지 않게 base64 봉투 하나로 보낸다. 쓰기는 DB 함수 안에서 한 트랜잭션 (D-020)
      const { data, error } = await db.schema("catalog").rpc("apply_import", { p_payload: encodeEnvelope(importPayload(w)) });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as { set_id?: string | null; inserted?: number; updated?: number };
      return { setId: r.set_id ?? null, inserted: r.inserted ?? 0, updated: r.updated ?? 0 };
    },
  };
}

