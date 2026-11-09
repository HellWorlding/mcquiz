import "server-only";
import { isKoreanTitle, qNoLabel } from "@/domains/shared/labels";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";

/** 주어진 문항들의 내 메모 (question_id → content) */
export async function getNotesFor(questionIds: string[]): Promise<Record<string, string>> {
  const user = await getCurrentUser();
  if (!user || questionIds.length === 0) return {};
  const db = await createClient();
  const out: Record<string, string> = {};
  for (let i = 0; i < questionIds.length; i += 200) {
    const { data } = await db
      .from("question_notes")
      .select("question_id, content")
      .eq("user_id", user.id)
      .in("question_id", questionIds.slice(i, i + 200));
    for (const r of data ?? []) out[r.question_id] = r.content;
  }
  return out;
}

export type NoteItem = {
  questionId: string;
  content: string;
  updatedAt: string;
  prompt: string;
  subjectId: string;
  unitId: string | null;
  unitLabel: string;
  /** 대단원(최상위 단원) id·이름. 트리가 아니면 null */
  groupId: string | null;
  groupLabel: string | null;
  /** "1강 7번" */
  noLabel: string;
  topic: string | null;
  correctText: string | null;
  correctExplanation: string | null;
  explanation: string | null;
  sourceQuote: string | null;
  sourcePage: number | null;
};

/** 내 메모 전체 (주제로 거르기 가능). 단원 순 → 최근 수정 순 */
export async function listMyNotes(subjectId: string | null): Promise<NoteItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const db = await createClient();
  const { data: notes } = await db
    .from("question_notes")
    .select("question_id, content, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (!notes?.length) return [];
  const ids = notes.map((n) => n.question_id);
  const qs: {
    id: string; prompt: string; subject_id: string; unit_id: string | null; topic: string | null; correct_choice: number | null; ord: number;
    explanation: string | null; source_quote: string | null; source_page: number | null;
    choices: { ord: number; text: string; explanation: string | null }[];
  }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from("questions")
      .select("id, prompt, subject_id, unit_id, topic, correct_choice, ord, explanation, source_quote, source_page, choices(ord, text, explanation)")
      .in("id", ids.slice(i, i + 200));
    qs.push(...(data ?? []));
  }
  const unitIds = [...new Set(qs.map((q) => q.unit_id).filter((x): x is string => !!x))];
  const units = new Map<string, { id: string; no: number | null; title: string; sort: number; parent_id: string | null }>();
  if (unitIds.length) {
    // 조상까지 필요하므로 관련 주제의 단원을 모두 읽는다 (단원 수는 작다)
    const subjectIds = [...new Set(qs.map((q) => q.subject_id))];
    const { data } = await db.from("units").select("id, no, title, sort, parent_id").in("subject_id", subjectIds);
    for (const u of data ?? []) units.set(u.id, u);
  }
  const topOf = (id: string | null) => {
    let cur = id ? units.get(id) : undefined;
    while (cur && cur.parent_id) cur = units.get(cur.parent_id);
    return cur ?? null;
  };
  const byId = new Map(qs.map((q) => [q.id, q]));
  return notes
    .map((n) => {
      const q = byId.get(n.question_id);
      if (!q) return null;
      if (subjectId && q.subject_id !== subjectId) return null;
      const u = q.unit_id ? units.get(q.unit_id) : null;
      const top = topOf(q.unit_id);
      const isTree = !!(u && top && top.id !== u.id);
      return {
        questionId: n.question_id,
        content: n.content,
        updatedAt: n.updated_at,
        prompt: q.prompt,
        subjectId: q.subject_id,
        unitId: q.unit_id,
        unitLabel: u ? (isTree ? `${top!.title} › ${u.no !== null ? `${u.no}. ` : ""}${u.title}` : u.no !== null && isKoreanTitle(u.title) ? `${u.no}강 ${u.title}` : u.title) : "단원 없음",
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
    .map((x) => {
      const { _sort, ...rest } = x;
      void _sort;
      return rest;
    });
}
