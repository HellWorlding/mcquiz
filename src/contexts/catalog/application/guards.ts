import { err, ok, type Result } from "@/shared/result";
import type { CurrentUser } from "@/contexts/access";
import type { CatalogDeps } from "./ports";

export function requireUser(deps: CatalogDeps): Result<CurrentUser> {
  if (!deps.user) return err("로그인이 필요합니다.");
  return ok(deps.user);
}

export function requireAdmin(deps: CatalogDeps): Result<CurrentUser> {
  if (!deps.user) return err("로그인이 필요합니다.");
  if (!deps.user.isAdmin) return err("관리자만 할 수 있습니다.");
  return ok(deps.user);
}

/** 리포지토리 예외를 Result 로 */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err((e as Error).message);
  }
}

/** 게스트(비로그인) 읽기는 공개 과목만 */
export const publicOnly = (deps: CatalogDeps) => ({ publicOnly: deps.user === null });
