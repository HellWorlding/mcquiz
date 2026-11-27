import type { Db } from "@/shared/db/types";
import type { MarkRepo } from "../../application/ports";

export function markRepo(db: Db): MarkRepo {
  const t = () => db.schema("learning").from("marks");
  return {
    async upsert(userId, questionIds, kind, at) {
      const { error } = await t().upsert(
        questionIds.map((question_id) => ({ user_id: userId, question_id, kind, at })),
        { onConflict: "user_id,question_id,kind" },
      );
      if (error) throw new Error(error.message);
    },
    async remove(userId, questionIds, kind) {
      const { error } = await t().delete().eq("user_id", userId).eq("kind", kind).in("question_id", questionIds);
      if (error) throw new Error(error.message);
    },
    async listMarked(userId, questionIds, kind) {
      const out: string[] = [];
      for (let i = 0; i < questionIds.length; i += 200) {
        const { data, error } = await t().select("question_id").eq("user_id", userId).eq("kind", kind).in("question_id", questionIds.slice(i, i + 200));
        if (error) throw new Error(error.message);
        for (const r of data ?? []) out.push(r.question_id);
      }
      return out;
    },
  };
}
