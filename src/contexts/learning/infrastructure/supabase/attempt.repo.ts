import type { Db } from "@/shared/db/types";
import { allRows } from "@/shared/paginate";
import type { AttemptRepo } from "../../application/ports";

export function attemptRepo(db: Db): AttemptRepo {
  const t = () => db.schema("learning").from("attempts");
  return {
    async add(a) {
      const { data, error } = await t()
        .insert({ user_id: a.userId, question_id: a.questionId, selected_ord: a.selectedOrd, is_correct: a.isCorrect, confused: a.confused, elapsed_sec: a.elapsedSec })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    },
    async setConfused(attemptId, userId, confused) {
      const { error } = await t().update({ confused }).eq("id", attemptId).eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
    async listForQuestions(userId, questionIds) {
      const out: Awaited<ReturnType<AttemptRepo["listForQuestions"]>> = [];
      for (let i = 0; i < questionIds.length; i += 100) {
        const chunk = questionIds.slice(i, i + 100);
        const rows = await allRows((f, to) => t().select("id, question_id, selected_ord, is_correct, confused, elapsed_sec, created_at").eq("user_id", userId).in("question_id", chunk).order("created_at").range(f, to));
        for (const r of rows) out.push({ id: r.id, questionId: r.question_id, selectedOrd: r.selected_ord, isCorrect: r.is_correct, confused: r.confused, elapsedSec: r.elapsed_sec, createdAt: r.created_at });
      }
      return out;
    },
  };
}
