import type { Db } from "@/shared/db/types";
import type { AccessDeps } from "../application/ports";
import type { CurrentUser } from "../domain/user";
import { membershipRepo } from "./supabase/membership.repo";
import { profileRepo } from "./supabase/profile.repo";

/** admin 클라이언트는 이메일로 사용자 찾기(다른 사람의 프로필)에만 쓴다 */
export function makeAccessDeps(db: Db, user: CurrentUser | null, admin: Db | null = null): AccessDeps {
  return { user, profiles: profileRepo(db, admin), members: membershipRepo(db) };
}
