import "server-only";
import { getCurrentUser } from "@/contexts/access/server";
import { sessionDb } from "@/shared/db/server";
import type { CommunityDeps } from "../application/ports";
import { makeCommunityDeps } from "../infrastructure/make-deps";

/** 세션 쿠키 사용자 + RLS 클라이언트로 deps 조립 (액션·로더 공용) */
export async function sessionCommunityDeps(): Promise<CommunityDeps> {
  const [db, user] = await Promise.all([sessionDb(), getCurrentUser()]);
  return makeCommunityDeps(db, user);
}
