import "server-only";
import { getCurrentUser } from "@/contexts/access";
import { makeCatalogApi } from "@/contexts/catalog";
import { sessionDb } from "@/shared/db/server";
import type { KnowledgeDeps } from "../application/ports";
import { makeKnowledgeDeps } from "../infrastructure/make-deps";

/** 요청의 세션(RLS)으로 동작하는 knowledge deps. 서버 액션·페이지 로더 공용 */
export async function sessionKnowledgeDeps(): Promise<KnowledgeDeps> {
  const [db, user] = await Promise.all([sessionDb(), getCurrentUser()]);
  return makeKnowledgeDeps(db, user, { catalog: makeCatalogApi(db, user) });
}
