import { err, ok, type Result } from "@/shared/result";
import { isKoreanTitle, qNoLabel, unitLabel } from "@/shared/labels";
import type { LearningUnit, NoteItem } from "../domain/types";
import type { LearningDeps } from "./ports";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 문항 메모 저장. 비우면 삭제. 게스트는 저장하지 않는다 */
export async function saveNote(deps: LearningDeps, questionId: string, content: string): Promise<Result<"saved" | "deleted" | "guest">> {
  if (!deps.user) return ok("guest");
  const text = content.trim();
  try {
    if (!text) {
      await deps.notes.remove(deps.user.id, questionId);
      return ok("deleted");
    }
    await deps.notes.upsert(deps.user.id, questionId, text, deps.clock.now());
    return ok("saved");
  } catch (e) {
    return err(msg(e));
  }
}

/** 주어진 문항들의 내 메모 */
export async function notesFor(deps: LearningDeps, questionIds: string[]): Promise<Map<string, string>> {
  if (!deps.user || questionIds.length === 0) return new Map();
  return deps.notes.forQuestions(deps.user.id, questionIds);
}

/** 내 메모 전체 (과목으로 거르기 가능). 단원 순 → 최근 수정 순 */
export async function listNotes(deps: LearningDeps, subjectId: string | null): Promise<NoteItem[]> {
  if (!deps.user) return [];
  const notes = await deps.notes.listAll(deps.user.id);
  if (!notes.length) return [];
  const qs = await deps.catalog.questionsByIds(notes.map((n) => n.questionId));
  const picked = subjectId ? qs.filter((q) => q.subject_id === subjectId) : qs;
  const subjectIds = [...new Set(picked.map((q) => q.subject_id))];
  const units = new Map<string, LearningUnit>();
  for (const sid of subjectIds) for (const u of await deps.catalog.listUnits(sid)) units.set(u.id, u);
  const topOf = (id: string | null) => {
    let cur = id ? units.get(id) : undefined;
    while (cur && cur.parent_id) cur = units.get(cur.parent_id);
    return cur ?? null;
  };
  const byId = new Map(picked.map((q) => [q.id, q]));
  return notes
    .map((n) => {
      const q = byId.get(n.questionId);
      if (!q) return null;
      const u = q.unit_id ? units.get(q.unit_id) : null;
      const top = topOf(q.unit_id);
      const isTree = !!(u && top && top.id !== u.id);
      return {
        questionId: n.questionId,
        content: n.content,
        updatedAt: n.updatedAt,
        prompt: q.prompt,
        subjectId: q.subject_id,
        unitId: q.unit_id,
        unitLabel: u ? (isTree ? `${top!.title} › ${u.no !== null ? `${u.no}. ` : ""}${u.title}` : unitLabel(u.no, u.title)) : "단원 없음",
        groupId: isTree ? top!.id : null,
        groupLabel: isTree ? top!.title : null,
        noLabel: !u ? `${q.ord}번` : !isKoreanTitle(u.title) ? `${u.title} ${qNoLabel(q.ord, false)}` : u.no !== null ? `${u.no}강 ${q.ord}번` : `${q.ord}번`,
        topic: q.topic,
        correctText: q.choices.find((c) => c.ord === q.correct_choice)?.text ?? null,
        correctExplanation: q.choices.find((c) => c.ord === q.correct_choice)?.explanation ?? null,
        explanation: q.explanation,
        sourceQuote: q.source_quote,
        sourcePage: q.source_page,
        _sort: u ? (u.no ?? u.sort) : 9999,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a._sort - b._sort || a.noLabel.localeCompare(b.noLabel, "ko", { numeric: true }))
    .map(({ _sort, ...rest }) => {
      void _sort;
      return rest;
    });
}
