import type { Db } from "@/shared/db/types";
import type { NoteRepo } from "../../application/ports";

export function noteRepo(db: Db): NoteRepo {
  const t = () => db.schema("learning").from("notes");
  return {
    async upsert(userId, questionId, content, at) {
      const { error } = await t().upsert({ user_id: userId, question_id: questionId, content, updated_at: at }, { onConflict: "user_id,question_id" });
      if (error) throw new Error(error.message);
    },
    async remove(userId, questionId) {
      const { error } = await t().delete().eq("user_id", userId).eq("question_id", questionId);
      if (error) throw new Error(error.message);
    },
    async forQuestions(userId, questionIds) {
      const out = new Map<string, string>();
      for (let i = 0; i < questionIds.length; i += 200) {
        const { data, error } = await t().select("question_id, content").eq("user_id", userId).in("question_id", questionIds.slice(i, i + 200));
        if (error) throw new Error(error.message);
        for (const r of data ?? []) out.set(r.question_id, r.content);
      }
      return out;
    },
    async listAll(userId) {
      const { data, error } = await t().select("question_id, content, updated_at").eq("user_id", userId).order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((n) => ({ questionId: n.question_id, content: n.content, updatedAt: n.updated_at }));
    },
  };
}
