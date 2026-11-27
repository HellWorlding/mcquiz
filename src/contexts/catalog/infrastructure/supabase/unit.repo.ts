import type { Db } from "@/shared/db/types";
import type { UnitInsert, UnitRepo } from "../../application/ports";
import { check, must, toUnit } from "./mappers";

const row = (r: UnitInsert) => ({ subject_id: r.subjectId, parent_id: r.parentId, title: r.title, no: r.no, sort: r.sort });

export function unitRepo(db: Db): UnitRepo {
  const t = () => db.schema("catalog").from("units");
  return {
    async list(subjectId) {
      const { data } = await t().select("*").eq("subject_id", subjectId).order("sort").order("no", { nullsFirst: false });
      return (data ?? []).map(toUnit);
    },
    async byId(id) {
      const { data } = await t().select("*").eq("id", id).maybeSingle();
      return data ? toUnit(data) : null;
    },
    async insert(r) {
      return toUnit(must(await t().insert(row(r)).select("*").single()));
    },
    async insertMany(rows) {
      check(await t().upsert(rows.map(row), { ignoreDuplicates: true }));
    },
    async update(id, patch) {
      check(await t().update(patch).eq("id", id));
    },
    async delete(id) {
      check(await t().delete().eq("id", id));
    },
    async subtree(rootIds) {
      const { data } = await db.schema("catalog").rpc("unit_subtree", { root_ids: rootIds });
      return (data ?? []) as string[];
    },
    async questionCounts(subjectId) {
      const { data } = await db.schema("catalog").rpc("question_counts_by_unit", { p_subject: subjectId });
      return (data ?? []).map((r) => ({ unitId: r.unit_id ?? null, n: Number(r.n) }));
    },
    async classify(subjectId, tokens) {
      const { data, error } = await db.schema("catalog").rpc("classify_unit", { p_subject: subjectId, p_tokens: tokens });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ unitId: r.unit_id, score: Number(r.score) }));
    },
  };
}
