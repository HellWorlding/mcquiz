import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";

export type AiMode = "grounded" | "open";

/**
 * 주제의 AI 답변 방식. 자료(스크립트·책)를 올린 주제는 자료에 있는 내용만 근거로 답하고(grounded),
 * 자료가 없는 주제는 AI 의 일반 지식으로 자유롭게 답한다(open).
 */
export async function getAiMode(db: SupabaseClient<Database>, subjectId: string): Promise<AiMode> {
  const { count } = await db.from("sources").select("id", { count: "exact", head: true }).eq("subject_id", subjectId);
  return (count ?? 0) > 0 ? "grounded" : "open";
}
