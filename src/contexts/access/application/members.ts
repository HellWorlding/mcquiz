import { err, ok, type Result } from "@/shared/result";
import { normalizeEmail } from "../domain/user";
import type { AccessDeps, Member } from "./ports";

function requireAdmin(deps: AccessDeps): Result<void> {
  if (!deps.user) return err("로그인이 필요합니다.");
  if (!deps.user.isAdmin) return err("관리자만 할 수 있습니다.");
  return ok(undefined);
}

export async function listMembers(deps: AccessDeps, subjectId: string): Promise<Result<Member[]>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  return ok(await deps.members.list(subjectId));
}

/** A3. 이메일로 사용자를 찾아 제한 과목 멤버로 넣는다. 이미 멤버면 그대로 성공 */
export async function grantMember(deps: AccessDeps, subjectId: string, email: string): Promise<Result<{ userId: string }>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const e = normalizeEmail(email);
  if (!e) return err("이메일을 입력하세요.");
  const found = await deps.profiles.findByEmail(e);
  if (!found) return err("그 이메일로 가입한 사용자가 없습니다. 먼저 가입해야 합니다.");
  if (!(await deps.members.isMember(subjectId, found.id))) await deps.members.grant(subjectId, found.id);
  return ok({ userId: found.id });
}

export async function revokeMember(deps: AccessDeps, subjectId: string, userId: string): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  await deps.members.revoke(subjectId, userId);
  return ok(undefined);
}
