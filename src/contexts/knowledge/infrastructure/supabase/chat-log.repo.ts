import type { Db } from "@/shared/db/types";
import type { ChatLogRepo } from "../../application/ports";

export function chatLogRepo(db: Db): ChatLogRepo {
  const t = () => db.schema("knowledge").from("chat_logs");
  return {
    async insert(row) {
      const { error } = await t().insert({ user_id: row.userId, subject_id: row.subjectId, question_id: row.questionId, question: row.question, answer: row.answer, sources: row.sources });
      if (error) throw new Error(error.message);
    },
    async timestampsSince(userId, sinceIso) {
      const { data, error } = await t().select("created_at").eq("user_id", userId).gte("created_at", sinceIso).order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.created_at);
    },
    async recentForQuestion(userId, questionId, limit) {
      const { data, error } = await t().select("question, answer, created_at").eq("user_id", userId).eq("question_id", questionId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).reverse().map((r) => ({ question: r.question, answer: r.answer }));
    },
  };
}
