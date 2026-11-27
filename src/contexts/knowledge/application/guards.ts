import { err, ok, type Result } from "@/shared/result";
import type { KnowledgeDeps } from "./ports";

export function requireUser(deps: KnowledgeDeps): Result<NonNullable<KnowledgeDeps["user"]>> {
  if (!deps.user) return err("로그인이 필요합니다.");
  return ok(deps.user);
}

export function requireAdmin(deps: KnowledgeDeps): Result<NonNullable<KnowledgeDeps["user"]>> {
  if (!deps.user) return err("로그인이 필요합니다.");
  if (!deps.user.isAdmin) return err("관리자만 할 수 있습니다.");
  return ok(deps.user);
}

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
