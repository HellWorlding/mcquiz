import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/contexts/access";
import { makeCatalogApi } from "@/contexts/catalog";
import { sessionDb } from "@/shared/db/server";
import type { LearningDeps } from "../application/ports";
import { learningApiFrom, type LearningApi } from "../application/api";
import { makeLearningDeps } from "./make-deps";

/** 요청의 쿠키 세션으로 만든 Learning deps (서버 액션·페이지 로더용). 요청당 한 번 */
export const sessionLearningDeps = cache(async (): Promise<LearningDeps> => {
  const [db, user] = await Promise.all([sessionDb(), getCurrentUser()]);
  return makeLearningDeps(db, user, { catalog: makeCatalogApi(db, user) });
});

export async function sessionLearningApi(): Promise<LearningApi> {
  return learningApiFrom(await sessionLearningDeps());
}

/** 같은 요청의 Catalog 공개 API (묶음 추가 등 풀이 화면이 부르는 Catalog 액션용) */
export const sessionCatalogApi = cache(async () => {
  const [db, user] = await Promise.all([sessionDb(), getCurrentUser()]);
  return makeCatalogApi(db, user);
});
