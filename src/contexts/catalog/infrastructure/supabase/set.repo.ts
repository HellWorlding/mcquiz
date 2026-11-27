import type { Db } from "@/shared/db/types";
import type { SetRepo } from "../../application/ports";
import { check, must, toSet } from "./mappers";

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
    async create(r) {
      const res = await t().insert({ subject_id: r.subjectId, title: r.title, source_filename: r.sourceFilename, created_by: r.createdBy }).select("id").single();
      if (res.error) throw new Error(res.error.message ?? "세트를 만들지 못했습니다");
      return must(res).id;
    },
    async delete(id) {
      check(await t().delete().eq("id", id));
    },
  };
}
