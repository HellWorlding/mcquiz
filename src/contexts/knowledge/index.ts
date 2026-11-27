// knowledge 컨텍스트 공개 API. 다른 컨텍스트와 src/app, scripts 는 이 파일만 import 한다.

// 타입
export type { Source, SourceKind, Chunk } from "./domain/source";
export type { SearchHit, Evidence, SearchMode } from "./domain/search";
export type { AiMode } from "./domain/ai-mode";
export type { AiQuota } from "./domain/quota";
export type { EmbedProgress } from "./domain/embedding";
export type { ChatMessage, ChatSource, ChatLang } from "./domain/chat";
export type { ChatInput, ChatReply, ChatContext } from "./application/chat";
export type { RegisterInput, RegisterResult } from "./application/register-source";
export type { SearchInput, LocateInput, LocateResult } from "./application/search";
export type { EmbedTarget, EmbedOptions } from "./application/embed";
export type { FilePage, SplitResult } from "./application/files";
export type { KnowledgeApi } from "./application/api";
export type { KnowledgeDeps, SubjectFile, CatalogPort, EmbeddingProvider, ChatModel, FileStorage, TextExtractor, PdfSplitter } from "./application/ports";
export type { CatalogApiLike } from "./infrastructure/catalog-adapter";

// 순수 함수 (스크립트·다른 컨텍스트가 쓸 수 있는 것)
export { SOURCE_KINDS, toSourceKind } from "./domain/source";
export { sourceLabel, makeSnippet, fuseRrf } from "./domain/search";
export { chunkText, htmlToText, extractSourceUrl } from "./domain/chunk";
export { estimateTokens, EMBEDDING_DIMS } from "./domain/embedding";
export { plainText } from "./domain/plain";

// use case
export { registerSource, registerSources, deleteSource } from "./application/register-source";
export { embedPending, embedStatus } from "./application/embed";
export { listSources, getSource, getSourceWithContent, readChunks } from "./application/sources";
export { searchSources, findEvidence, locateChunk } from "./application/search";
export { chat, chatContext, aiQuota, aiMode } from "./application/chat";
export { filePage, filePageUrl, hasFileForPage, uploadWholeFile, splitBookFile } from "./application/files";
export { knowledgeApi } from "./application/api";

// 조립
export { makeKnowledgeDeps, makeKnowledgeApi } from "./infrastructure/make-deps";

// 다른 컨텍스트의 화면(Learning 의 풀이 화면)이 쓰는 컴포넌트
export { EvidencePanel } from "./ui/components/EvidencePanel";
export { ChatDock, type ChatDockQuestion } from "./ui/components/ChatDock";
