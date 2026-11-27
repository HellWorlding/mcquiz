import type { Db } from "@/shared/db/types";
import type { MembershipRepo } from "../../application/ports";

export function membershipRepo(db: Db): MembershipRepo {
  return {
    async list(subjectId) {
      const { data } = await db.schema("access").from("subject_members").select("user_id, created_at").eq("subject_id", subjectId);
      const ids = (data ?? []).map((m) => m.user_id);
      const { data: profiles } = ids.length ? await db.schema("access").from("profiles").select("id, email, display_name").in("id", ids) : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((m) => ({ userId: m.user_id, email: byId.get(m.user_id)?.email ?? null, displayName: byId.get(m.user_id)?.display_name ?? null, since: m.created_at }));
    },
    async isMember(subjectId, userId) {
      const { data } = await db.schema("access").from("subject_members").select("user_id").eq("subject_id", subjectId).eq("user_id", userId).maybeSingle();
      return !!data;
    },
    async grant(subjectId, userId) {
      const { error } = await db.schema("access").from("subject_members").insert({ subject_id: subjectId, user_id: userId });
      if (error) throw new Error(error.message);
    },
    async revoke(subjectId, userId) {
      const { error } = await db.schema("access").from("subject_members").delete().eq("subject_id", subjectId).eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
  };
}
