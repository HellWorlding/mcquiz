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
      const { data } = await client.schema("access").from("profiles").select("id, email").ilike("email", email).maybeSingle();
      return data ? { id: data.id, email: data.email ?? email } : null;
    },
  };
}
