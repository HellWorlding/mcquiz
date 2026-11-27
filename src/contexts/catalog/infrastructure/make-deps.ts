import type { Db } from "@/shared/db/types";
import type { CurrentUser } from "@/contexts/access";
import type { AiParser, CatalogDeps, TextExtractor } from "../application/ports";
import { makeApi, type CatalogApi } from "../application/api";
import { subjectRepo } from "./supabase/subject.repo";
import { unitRepo } from "./supabase/unit.repo";
import { questionRepo } from "./supabase/question.repo";
import { setRepo } from "./supabase/set.repo";
import { collectionRepo } from "./supabase/collection.repo";
import { openAiParser, type UnitExcerptProvider } from "./openai";
import { extractText } from "./text-extract";

export type CatalogExtra = {
  /** 기본은 OPENAI_API_KEY 가 있으면 OpenAI 어댑터, 없으면 null. 테스트·스크립트(--no-ai)는 null 을 넘긴다 */
  ai?: AiParser | null;
  /** AI 단원 분류에 줄 후보 단원 자료 발췌 (Knowledge 공개 API 어댑터, 선택) */
  excerpts?: UnitExcerptProvider;
  extractText?: TextExtractor;
};

/**
 * db 는 세션 클라이언트(RLS) 또는 service role. user 가 null 이면 게스트로 보고 공개 과목만 읽는다
 * (service role 로 게스트 모드를 돌릴 때 필요한 필터. 세션 클라이언트에서는 RLS 가 이미 거른다).
 */
export function makeCatalogDeps(db: Db, user: CurrentUser | null, extra: CatalogExtra = {}): CatalogDeps {
  return {
    user,
    subjects: subjectRepo(db),
    units: unitRepo(db),
    questions: questionRepo(db),
    sets: setRepo(db),
    collections: collectionRepo(db),
    ai: extra.ai === undefined ? openAiParser({ excerpts: extra.excerpts }) : extra.ai,
    extractText: extra.extractText ?? extractText,
  };
}

export function makeCatalogApi(db: Db, user: CurrentUser | null, extra: CatalogExtra = {}): CatalogApi {
  return makeApi(makeCatalogDeps(db, user, extra));
}
