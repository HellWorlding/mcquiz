import type { CurrentUser } from "@/contexts/access";
import type { Db } from "@/shared/db/types";
import type { LearningDeps } from "../application/ports";
import { learningApiFrom, type LearningApi } from "../application/api";
import { catalogQuestions, type CatalogApiSubset } from "./catalog.adapter";
import { attemptRepo } from "./supabase/attempt.repo";
import { markRepo } from "./supabase/mark.repo";
import { noteRepo } from "./supabase/note.repo";
import { sessionRepo } from "./supabase/session.repo";
import { statsReadModel } from "./supabase/stats.repo";

export type LearningExtra = { catalog: CatalogApiSubset };

/** 세션 클라이언트(RLS) + Catalog 공개 API 로 포트를 채운다 */
export function makeLearningDeps(db: Db, user: CurrentUser | null, extra: LearningExtra): LearningDeps {
  return {
    user,
    attempts: attemptRepo(db),
    sessions: sessionRepo(db),
    marks: markRepo(db),
    notes: noteRepo(db),
    stats: statsReadModel(db),
    catalog: catalogQuestions(extra.catalog),
    clock: { now: () => new Date().toISOString() },
    rng: { seed: () => Date.now() & 0xffff },
  };
}

export function makeLearningApi(db: Db, user: CurrentUser | null, extra: LearningExtra): LearningApi {
  return learningApiFrom(makeLearningDeps(db, user, extra));
}
