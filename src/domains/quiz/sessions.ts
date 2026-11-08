import "server-only";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";

export type UnfinishedSession = { id: string; title: string; position: number; total: number; updated_at: string };

/** 주제 안에서 아직 끝내지 않은 내 퀴즈 (이어서 풀기 목록) */
export async function listUnfinishedSessions(subjectId: string): Promise<UnfinishedSession[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const db = await createClient();
  const { data } = await db
    .from("quiz_sessions")
    .select("id, title, position, question_ids, updated_at")
    .eq("subject_id", subjectId)
    .eq("finished", false)
    .order("updated_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((s) => ({ id: s.id, title: s.title, position: s.position, total: s.question_ids.length, updated_at: s.updated_at }));
}
