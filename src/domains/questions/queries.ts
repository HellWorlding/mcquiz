import "server-only";
import { getReadClient, expandUnitIds } from "@/domains/subjects/queries";
import type { QuestionSet, QuestionWithChoices } from "@/domains/shared/types";
import { allRows } from "@/domains/shared/paginate";

export async function listSets(subjectId: string): Promise<(QuestionSet & { question_count: number })[]> {
  const { db } = await getReadClient();
  const { data } = await db
    .from("question_sets")
    .select("*, questions(count)")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((s) => {
    const { questions, ...rest } = s as QuestionSet & { questions: { count: number }[] };
    return { ...rest, question_count: questions?.[0]?.count ?? 0 };
  });
}

export async function getSet(setId: string): Promise<QuestionSet | null> {
  const { db } = await getReadClient();
  const { data } = await db.from("question_sets").select("*").eq("id", setId).maybeSingle();
  return data ?? null;
}

/** 단원별 문항 수 (하위 단원 미포함, 화면에서 합산) */
export async function countQuestionsByUnit(subjectId: string): Promise<Record<string, number>> {
  const { db } = await getReadClient();
  const data = await allRows<{ unit_id: string | null }>((f, t) => db.from("questions").select("unit_id").eq("subject_id", subjectId).range(f, t));
  const out: Record<string, number> = {};
  for (const r of data) {
    const k = r.unit_id ?? "__none__";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export async function countQuestionsByCollection(subjectId: string): Promise<Record<string, number>> {
  const { db, guest } = await getReadClient();
  if (guest) return {};
  const { data: cols } = await db.from("collections").select("id").eq("subject_id", subjectId);
  const ids = (cols ?? []).map((c) => c.id);
  if (ids.length === 0) return {};
  const { data } = await db.from("collection_items").select("collection_id").in("collection_id", ids);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.collection_id] = (out[r.collection_id] ?? 0) + 1;
  return out;
}

export type QuestionScope =
  | { kind: "set"; setId: string }
  | { kind: "units"; subjectId: string; unitIds: string[] }
  | { kind: "collection"; collectionId: string }
  | { kind: "subject"; subjectId: string }
  | { kind: "ids"; ids: string[] };

/** 범위에 해당하는 문항 id 목록 (세트 순서 / 단원 순서대로) */
export async function listQuestionIds(scope: QuestionScope): Promise<string[]> {
  const { db } = await getReadClient();
  switch (scope.kind) {
    case "set": {
      const { data } = await db.from("questions").select("id").eq("set_id", scope.setId).order("ord");
      return (data ?? []).map((r) => r.id);
    }
    case "units": {
      const all = await expandUnitIds(scope.unitIds);
      if (all.length === 0) return [];
      const data = await allRows<{ id: string; unit_id: string | null; set_id: string; ord: number }>((f, t) =>
        db.from("questions").select("id, unit_id, set_id, ord").eq("subject_id", scope.subjectId).in("unit_id", all).order("set_id").order("ord").range(f, t),
      );
      // 단원 순서(선택 순서 → 하위 순서)대로 정렬
      const unitOrder = new Map(all.map((id, i) => [id, i]));
      return data
        .sort((a, b) => (unitOrder.get(a.unit_id!) ?? 0) - (unitOrder.get(b.unit_id!) ?? 0))
        .map((r) => r.id);
    }
    case "collection": {
      // 하위 묶음 포함
      const { data: cols } = await db.from("collections").select("id, parent_id");
      const ids = new Set<string>([scope.collectionId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of cols ?? []) {
          if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
            ids.add(c.id);
            grew = true;
          }
        }
      }
      const { data } = await db
        .from("collection_items")
        .select("question_id, added_at")
        .in("collection_id", [...ids])
        .order("added_at");
      return [...new Set((data ?? []).map((r) => r.question_id))];
    }
    case "subject": {
      const data = await allRows<{ id: string }>((f, t) =>
        db.from("questions").select("id").eq("subject_id", scope.subjectId).order("set_id").order("ord").range(f, t),
      );
      return data.map((r) => r.id);
    }
    case "ids":
      return scope.ids;
  }
}

/** 문항 + 선지를 id 순서 그대로 돌려준다 (RLS 적용) */
export async function getQuestionsByIds(ids: string[]): Promise<QuestionWithChoices[]> {
  if (ids.length === 0) return [];
  const { db } = await getReadClient();
  const out: QuestionWithChoices[] = [];
  // in() 길이 제한을 피하려고 200개씩 나눠 조회
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await db.from("questions").select("*, choices(*)").in("id", chunk);
    for (const q of data ?? []) {
      out.push({ ...q, choices: [...(q.choices ?? [])].sort((a, b) => a.ord - b.ord) });
    }
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function listSetQuestions(setId: string): Promise<QuestionWithChoices[]> {
  const ids = await listQuestionIds({ kind: "set", setId });
  return getQuestionsByIds(ids);
}
