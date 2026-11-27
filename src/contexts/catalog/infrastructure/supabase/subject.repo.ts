import type { Db } from "@/shared/db/types";
import type { SubjectRepo } from "../../application/ports";
import { check, must, toSubject } from "./mappers";

export function subjectRepo(db: Db): SubjectRepo {
  const t = () => db.schema("catalog").from("subjects");
  return {
    async list({ publicOnly }) {
      let q = t().select("*").order("created_at");
      if (publicOnly) q = q.eq("visibility", "public");
      const { data } = await q;
      return (data ?? []).map(toSubject);
    },
    async byId(id, { publicOnly }) {
      let q = t().select("*").eq("id", id);
      if (publicOnly) q = q.eq("visibility", "public");
      const { data } = await q.maybeSingle();
      return data ? toSubject(data) : null;
    },
    async byName(name) {
      const { data } = await t().select("*").eq("name", name.trim()).maybeSingle();
      return data ? toSubject(data) : null;
    },
    async create(name, visibility) {
      const res = await t().insert({ name, visibility }).select("*").single();
      if (res.error) throw new Error(`과목 "${name}" 생성 실패: ${res.error.message}`);
      return toSubject(must(res));
    },
    async setVisibility(id, visibility) {
      check(await t().update({ visibility }).eq("id", id));
    },
  };
}
