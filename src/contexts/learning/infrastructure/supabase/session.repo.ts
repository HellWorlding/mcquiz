import type { Db } from "@/shared/db/types";
import type { SessionRepo } from "../../application/ports";
import type { SessionAnswer } from "../../domain/types";

export function sessionRepo(db: Db): SessionRepo {
  const t = () => db.schema("learning").from("quiz_sessions");
  return {
    async get(id) {
      const { data } = await t().select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        subjectId: data.subject_id,
        title: data.title,
        questionIds: data.question_ids,
        position: data.position,
        answers: (data.answers ?? {}) as Record<string, SessionAnswer>,
        finished: data.finished,
        updatedAt: data.updated_at,
      };
    },
    async listUnfinished(subjectId, limit) {
      const { data } = await t().select("id, title, position, question_ids, updated_at").eq("subject_id", subjectId).eq("finished", false).order("updated_at", { ascending: false }).limit(limit);
      return (data ?? []).map((s) => ({ id: s.id, title: s.title, position: s.position, total: s.question_ids.length, updatedAt: s.updated_at }));
    },
    async insert(userId, row) {
      const { data, error } = await t()
        .insert({ user_id: userId, subject_id: row.subjectId, title: row.title, question_ids: row.questionIds, position: row.position, answers: row.answers as never, finished: row.finished, updated_at: row.updatedAt })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    },
    async update(id, userId, row) {
      const { error } = await t()
        .update({ subject_id: row.subjectId, title: row.title, question_ids: row.questionIds, position: row.position, answers: row.answers as never, finished: row.finished, updated_at: row.updatedAt })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
    async delete(id, userId) {
      const { error } = await t().delete().eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
  };
}
