import type { Db } from "@/shared/db/types";
import type { ProfileRepo } from "../../application/ports";

export function profileRepo(db: Db, admin: Db | null): ProfileRepo {
  return {
    async byId(id) {
      const { data } = await db.schema("access").from("profiles").select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      return { id: data.id, email: data.email ?? "", displayName: data.display_name, isAdmin: data.is_admin, aiLimit: data.ai_limit };
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
