import "server-only";
import { sessionDb } from "@/shared/db/server";
import { getCurrentUser } from "../infrastructure/session";
import { makeAccessDeps } from "../infrastructure/make-deps";
import { listMembers, listProfiles } from "../application/members";
import type { CurrentUser } from "../domain/user";
import type { Member } from "../application/ports";

export type SubjectMember = Member & { subjectId: string };

/** /admin 페이지: 가입 사용자 전체 (관리자가 아니면 빈 목록) */
export async function listAllProfiles(): Promise<CurrentUser[]> {
  const [db, user] = await Promise.all([sessionDb(), getCurrentUser()]);
  const r = await listProfiles(makeAccessDeps(db, user)); // 관리자 세션은 RLS 로 전체 프로필을 읽는다
  return r.ok ? r.data : [];
}

/** /admin 페이지: 여러 과목의 멤버를 한 번에 (관리자가 아니면 빈 목록) */
export async function listMembersOf(subjectIds: string[]): Promise<SubjectMember[]> {
  const [db, user] = await Promise.all([sessionDb(), getCurrentUser()]);
  const deps = makeAccessDeps(db, user);
  const lists = await Promise.all(subjectIds.map((id) => listMembers(deps, id)));
  return lists.flatMap((r, i) => (r.ok ? r.data.map((m) => ({ ...m, subjectId: subjectIds[i] })) : []));
}
