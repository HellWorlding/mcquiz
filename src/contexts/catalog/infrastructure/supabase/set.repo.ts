import type { Db } from "@/shared/db/types";
import type { SetRepo } from "../../application/ports";
import { check, toSet } from "./mappers";

export function setRepo(db: Db): SetRepo {
  const t = () => db.schema("catalog").from("question_sets");
  return {
    async list(subjectId) {
      const { data } = await t().select("*, questions(count)").eq("subject_id", subjectId).order("created_at", { ascending: false });
      return (data ?? []).map(toSet);
    },
    async listAll() {
      const { data } = await t().select("*, questions(count)").order("created_at", { ascending: false });
      return (data ?? []).map(toSet);
    },
    async byId(id) {
      const { data } = await t().select("*").eq("id", id).maybeSingle();
      return data ? toSet(data) : null;
    },
    async idsBySourceFilename(subjectId, filename) {
      const { data } = await t().select("id").eq("subject_id", subjectId).eq("source_filename", filename);
      return (data ?? []).map((s) => s.id);
    },
    async delete(id) {
      check(await t().delete().eq("id", id));
    },
  };
}
