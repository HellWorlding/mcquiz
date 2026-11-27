import type { CurrentUser } from "@/contexts/access";
import type { Db } from "@/shared/db/types";
import { knowledgeApi, type KnowledgeApi } from "../application/api";
import type { KnowledgeDeps } from "../application/ports";
import { catalogAdapter, type CatalogApiLike } from "./catalog-adapter";
import { openaiChat } from "./openai-chat";
import { openaiEmbeddings } from "./openai-embeddings";
import { pdfSplitter } from "./pdf-split";
import { chatLogRepo } from "./supabase/chat-log.repo";
import { chunkRepo } from "./supabase/chunk.repo";
import { fileRepo } from "./supabase/file.repo";
import { sourceRepo } from "./supabase/source.repo";
import { supabaseStorage } from "./supabase/storage";
import { textExtractor } from "./text-extractor";

export type KnowledgeExtra = {
  /** Catalog 공개 API (makeCatalogApi(db, user)) */
  catalog: CatalogApiLike;
  now?: () => Date;
};

/** db 는 세션 클라이언트(RLS) 또는 스크립트의 service role. OpenAI 키가 없으면 임베딩·챗 어댑터는 null */
export function makeKnowledgeDeps(db: Db, user: CurrentUser | null, extra: KnowledgeExtra): KnowledgeDeps {
  return {
    user,
    now: extra.now ?? (() => new Date()),
    sources: sourceRepo(db),
    chunks: chunkRepo(db),
    files: fileRepo(db),
    storage: supabaseStorage(db),
    extractor: textExtractor,
    pdf: pdfSplitter,
    embeddings: openaiEmbeddings(),
    chatModel: openaiChat(),
    chatLogs: chatLogRepo(db),
    catalog: catalogAdapter(extra.catalog),
  };
}

export function makeKnowledgeApi(db: Db, user: CurrentUser | null, extra: KnowledgeExtra): KnowledgeApi {
  return knowledgeApi(makeKnowledgeDeps(db, user, extra));
}
