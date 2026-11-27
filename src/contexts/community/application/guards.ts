import type { CurrentUser } from "@/contexts/access";
import { err, ok, type Result } from "@/shared/result";
import type { CommunityDeps } from "./ports";

/** 사용자 한 명이 24시간 안에 쓸 수 있는 글·신고 수 */
export const DAILY_LIMIT = 10;
export const DAY_MS = 24 * 3600 * 1000;

export function requireUser(deps: CommunityDeps): Result<CurrentUser> {
  if (!deps.user) return err("로그인이 필요합니다.");
  return ok(deps.user);
}

export function requireAdmin(deps: CommunityDeps): Result<CurrentUser> {
  const u = requireUser(deps);
  if (!u.ok) return u;
  if (!u.data.isAdmin) return err("관리자만 할 수 있습니다.");
  return u;
}

export function dayAgo(deps: CommunityDeps): Date {
  return new Date(deps.now().getTime() - DAY_MS);
}

export function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
