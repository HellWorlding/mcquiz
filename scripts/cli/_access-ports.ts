/**
 * [임시] access 포트의 CLI 구현.
 *
 * 원래는 `@/contexts/access/server` 의 makeAccessDeps 를 써야 하지만, 그 파일이 session.ts(`import "server-only"`, next/navigation)
 * 를 함께 export 해서 tsx(Next 밖)에서는 import 자체가 실패한다 (`server-only` 는 Next 가 번들 시점에 주는 가상 모듈).
 * access 의 use case(grantMember/revokeMember)는 index 에서 가져와 그대로 쓰고, 리포지토리만 여기서 채운다.
 * → access/server 가 세션 없이 import 가능해지면 이 파일을 지우고 _deps.ts 에서 makeAccessDeps(db, user, db) 로 바꾼다.
 */
import type { Db } from "@/shared/db/types";
import type { MembershipRepo, ProfileRepo } from "@/contexts/access";

export function cliProfileRepo(db: Db): ProfileRepo {
  return {
    async byId(id) {
      const { data } = await db.schema("access").from("profiles").select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      return { id: data.id, email: data.email ?? "", displayName: data.display_name, isAdmin: data.is_admin, aiLimit: data.ai_limit };
    },
    async findByEmail(email) {
      // 정확히 일치하는 이메일만 (ilike 는 _ % 가 와일드카드로 동작한다)
      const { data } = await db.schema("access").from("profiles").select("id, email").eq("email", email.trim().toLowerCase()).limit(2);
      if (!data || data.length !== 1) return null;
      return { id: data[0].id, email: data[0].email ?? email };
    },
  };
}

export function cliMembershipRepo(db: Db): MembershipRepo {
  return {
    async list(subjectId) {
      const { data } = await db.schema("access").from("subject_members").select("user_id, created_at").eq("subject_id", subjectId);
      return (data ?? []).map((m) => ({ userId: m.user_id, email: null, displayName: null, since: m.created_at }));
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

/**
 * [임시] 관리자 플래그. access 컨텍스트에 setAdmin use case 가 없어 CLI 가 직접 쓴다 (옛 grant-subject --admin 과 같은 일).
 * 돌려주는 값: 바뀐 계정의 이메일, 없으면 null.
 */
export async function setAdminFlag(db: Db, email: string, on: boolean): Promise<string | null> {
  const { data, error } = await db.schema("access").from("profiles").update({ is_admin: on }).eq("email", email.trim().toLowerCase()).select("email");
  if (error) throw new Error(error.message);
  return data?.[0]?.email ?? null;
}
