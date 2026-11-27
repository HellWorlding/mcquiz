import type { Db } from "@/shared/db/types";
import type { ProfileRepo } from "../../application/ports";
import type { CurrentUser } from "../../domain/user";

const toUser = (d: { id: string; email: string | null; display_name: string | null; is_admin: boolean; ai_limit: number | null }): CurrentUser => ({ id: d.id, email: d.email ?? "", displayName: d.display_name, isAdmin: d.is_admin, aiLimit: d.ai_limit });

export function profileRepo(db: Db, admin: Db | null): ProfileRepo {
  return {
    async byId(id) {
      const { data } = await db.schema("access").from("profiles").select("*").eq("id", id).maybeSingle();
      return data ? toUser(data) : null;
    },
    async listAll() {
      const { data } = await (admin ?? db).schema("access").from("profiles").select("*").order("created_at");
      return (data ?? []).map(toUser);
    },
    async setAdmin(userId, on) {
      if (!admin) throw new Error("관리자 플래그 변경은 service role 이 필요합니다.");
      const { error } = await admin.schema("access").from("profiles").update({ is_admin: on }).eq("id", userId);
      if (error) throw new Error(error.message);
    },
    async findByEmail(email) {
      const client = admin ?? db;
      // 정확히 일치하는 이메일만 (ilike 는 _ % 가 와일드카드로 동작해 다른 계정에 권한을 줄 수 있다 — 검토 I6)
      const { data } = await client.schema("access").from("profiles").select("id, email").eq("email", email.trim().toLowerCase()).limit(2);
      if (!data || data.length !== 1) return null;
      return { id: data[0].id, email: data[0].email ?? email };
    },
  };
}
