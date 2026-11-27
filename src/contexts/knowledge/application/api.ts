import type { Result } from "@/shared/result";
import type { EmbedProgress } from "../domain/embedding";
import type { Evidence, SearchHit } from "../domain/search";
import type { Chunk, Source } from "../domain/source";
import { chat, chatContext, type ChatContext, type ChatInput, type ChatReply } from "./chat";
import { embedPending, type EmbedOptions, type EmbedTarget } from "./embed";
import { filePage, type FilePage } from "./files";
import type { KnowledgeDeps } from "./ports";
import { deleteSource, registerSource, type RegisterInput, type RegisterResult } from "./register-source";
import { findEvidence, searchSources, type SearchInput } from "./search";
import { getSource, listSources, readChunks } from "./sources";

/** PRD-04 §4 knowledge 공개 API. 다른 컨텍스트(Integration 의 MCP 도구 등)는 이 객체만 쓴다 */
export type KnowledgeApi = {
  registerSource(input: RegisterInput): Promise<Result<RegisterResult>>; // admin
  deleteSource(id: string): Promise<Result<void>>; // admin
  embedPending(target: EmbedTarget, opts?: EmbedOptions): Promise<EmbedProgress>;
  listSources(subjectId: string, unitId?: string | null): Promise<Source[]>;
  getSource(id: string): Promise<Source | null>;
  readChunks(sourceId: string, fromOrd?: number, count?: number): Promise<{ chunks: Chunk[]; total: number; nextOrd: number | null }>;
  searchSources(input: SearchInput): Promise<SearchHit[]>;
  findEvidence(questionId: string): Promise<Result<Evidence>>;
  chat(input: ChatInput): Promise<Result<ChatReply>>;
  chatContext(subjectId: string, questionId?: string | null): Promise<Result<ChatContext>>; // { mode, quota, aiEnabled, history }
  filePage(subjectId: string, page: number | null): Promise<FilePage | null>;
};

export function knowledgeApi(deps: KnowledgeDeps): KnowledgeApi {
  return {
    registerSource: (input) => registerSource(deps, input),
    deleteSource: (id) => deleteSource(deps, id),
    embedPending: (target, opts) => embedPending(deps, target, opts),
    listSources: (subjectId, unitId) => listSources(deps, subjectId, unitId),
    getSource: (id) => getSource(deps, id),
    readChunks: (sourceId, fromOrd, count) => readChunks(deps, sourceId, fromOrd, count),
    searchSources: (input) => searchSources(deps, input),
    findEvidence: (questionId) => findEvidence(deps, questionId),
    chat: (input) => chat(deps, input),
    chatContext: (subjectId, questionId) => chatContext(deps, subjectId, questionId),
    filePage: (subjectId, page) => filePage(deps, subjectId, page),
  };
}
