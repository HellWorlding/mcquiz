"use server";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import type { ActionResult } from "@/domains/shared/types";
import { buildSavedExport, exportFileBase, type ExportQuestion, type ExportRecord } from "@/domains/progress/export";

/** 저장된 문제 목록에서 빼기. 이후에 다시 틀리거나 저장하면 다시 들어온다. */
export async function dismissQuestionAction(questionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const db = await createClient();
  const { error } = await db
    .from("question_marks")
    .upsert({ user_id: user.id, question_id: questionId, kind: "dismissed", at: new Date().toISOString() }, { onConflict: "user_id,question_id,kind" });
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

/** 저장된 문제 목록에서 여러 개 한 번에 빼기 */
export async function dismissQuestionsAction(questionIds: string[]): Promise<ActionResult<number>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const ids = [...new Set(questionIds)].slice(0, 500);
  if (ids.length === 0) return { ok: true, data: 0 };
  const db = await createClient();
  const at = new Date().toISOString();
  const { error } = await db
    .from("question_marks")
    .upsert(ids.map((question_id) => ({ user_id: user.id, question_id, kind: "dismissed" as const, at })), { onConflict: "user_id,question_id,kind" });
  return error ? { ok: false, error: error.message } : { ok: true, data: ids.length };
}

/** 방금 뺀 문항을 되돌리기 (dismissed 표시 삭제) */
export async function undismissQuestionsAction(questionIds: string[]): Promise<ActionResult<number>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const ids = [...new Set(questionIds)].slice(0, 500);
  if (ids.length === 0) return { ok: true, data: 0 };
  const db = await createClient();
  const { error } = await db.from("question_marks").delete().eq("user_id", user.id).eq("kind", "dismissed").in("question_id", ids);
  return error ? { ok: false, error: error.message } : { ok: true, data: ids.length };
}

/** 문제 직접 저장 / 저장 취소 */
export async function saveQuestionAction(questionId: string, saved: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const db = await createClient();
  if (saved) {
    const { error } = await db
      .from("question_marks")
      .upsert({ user_id: user.id, question_id: questionId, kind: "saved", at: new Date().toISOString() }, { onConflict: "user_id,question_id,kind" });
    return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
  }
  const { error } = await db.from("question_marks").delete().eq("user_id", user.id).eq("question_id", questionId).eq("kind", "saved");
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

/** 1000행 제한을 넘는 조회를 range 로 끊어 읽는다 */
async function allRows<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetch(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * 저장함 내보내기: 고른 문항들의 원문과 내 기록을 JSON·Markdown 문자열로 돌려준다.
 * 세션 클라이언트(RLS)로만 읽으므로 볼 수 없는 주제의 문항은 빠진다. 다른 사람 기록은 섞이지 않는다.
 */
export async function exportSavedAction(
  subjectId: string,
  questionIds: string[],
  filterLabel: string | null,
): Promise<ActionResult<{ json: string; markdown: string; fileBase: string; count: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const ids = [...new Set(questionIds)].slice(0, 2000);
  if (ids.length === 0) return { ok: false, error: "내보낼 문항이 없습니다." };
  try {
    const db = await createClient();
    const [{ data: subject }, units] = await Promise.all([
      db.from("subjects").select("name").eq("id", subjectId).maybeSingle(),
      allRows((f, t) => db.from("units").select("id, no, title, parent_id").eq("subject_id", subjectId).range(f, t)),
    ]);
    if (!subject) return { ok: false, error: "주제를 찾을 수 없습니다." };
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    const questions: ExportQuestion[] = [];
    const attempts: { question_id: string; selected_ord: number | null; is_correct: boolean | null; confused: boolean; created_at: string; elapsed_sec: number | null }[] = [];
    const saved = new Set<string>();
    const notes = new Map<string, string>();
    for (const chunk of chunks) {
      const [qs, at, mk, nt] = await Promise.all([
        allRows((f, t) =>
          db
            .from("questions")
            .select("id, unit_id, ord, prompt, correct_choice, topic, difficulty, trap_types, tags, explanation, hint, source_quote, source_page, choices(ord, text, explanation)")
            .eq("subject_id", subjectId)
            .in("id", chunk)
            .range(f, t),
        ),
        allRows((f, t) =>
          db
            .from("attempts")
            .select("question_id, selected_ord, is_correct, confused, created_at, elapsed_sec")
            .eq("user_id", user.id)
            .in("question_id", chunk)
            .order("created_at")
            .range(f, t),
        ),
        allRows((f, t) => db.from("question_marks").select("question_id").eq("user_id", user.id).eq("kind", "saved").in("question_id", chunk).range(f, t)),
        allRows((f, t) => db.from("question_notes").select("question_id, content").eq("user_id", user.id).in("question_id", chunk).range(f, t)),
      ]);
      for (const q of qs) questions.push({ ...q, choices: [...(q.choices ?? [])].sort((a, b) => a.ord - b.ord) });
      attempts.push(...at);
      for (const m of mk) saved.add(m.question_id);
      for (const n of nt) notes.set(n.question_id, n.content);
    }
    const rec = new Map<string, ExportRecord & { secs: number[] }>();
    for (const a of attempts) {
      const g = rec.get(a.question_id) ?? { attempts: 0, wrong: 0, confused: 0, last: null, lastAt: null, wrongPicks: {}, avgSec: null, saved: false, note: null, secs: [] };
      if (a.selected_ord !== null) {
        g.attempts++;
        g.last = a.is_correct;
        g.lastAt = a.created_at;
        if (a.is_correct === false) {
          g.wrong++;
          g.wrongPicks[a.selected_ord] = (g.wrongPicks[a.selected_ord] ?? 0) + 1;
        }
        if (a.elapsed_sec) g.secs.push(a.elapsed_sec);
      }
      if (a.confused) g.confused++;
      rec.set(a.question_id, g);
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    const rows = questions
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((q) => {
        const g = rec.get(q.id);
        const r: ExportRecord = {
          attempts: g?.attempts ?? 0,
          wrong: g?.wrong ?? 0,
          confused: g?.confused ?? 0,
          last: g?.last ?? null,
          lastAt: g?.lastAt ?? null,
          wrongPicks: g?.wrongPicks ?? {},
          avgSec: g?.secs.length ? Math.round(g.secs.reduce((s, v) => s + v, 0) / g.secs.length) : null,
          saved: saved.has(q.id),
          note: notes.get(q.id) ?? null,
        };
        return { q, r };
      });
    const exportedAt = new Date().toISOString();
    const out = buildSavedExport({ subjectName: subject.name, exportedAt, filterLabel, units, rows });
    return { ok: true, data: { json: JSON.stringify(out.json, null, 2), markdown: out.markdown, fileBase: exportFileBase(subject.name, exportedAt), count: rows.length } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "내보내기에 실패했습니다." };
  }
}
