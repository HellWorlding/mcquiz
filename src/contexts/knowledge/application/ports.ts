import type { CurrentUser } from "@/contexts/access";
import type { Chunk, Source, SourceKind } from "../domain/source";
import type { TocRow } from "../domain/toc";

/** 자료 + 본문 (리포지토리 내부용; 공개 Source 에는 content 가 없다) */
export type SourceWithContent = Source & { content: string };

export type NewSource = { subjectId: string; unitId: string | null; kind: SourceKind; title: string; content: string; pageRange: string | null; url: string | null };

export type SourceRepo = {
  list(subjectId: string, unitId?: string | null): Promise<Source[]>;
  byId(id: string): Promise<SourceWithContent | null>;
  /** K6. 같은 과목·같은 제목의 자료 id 들 */
  idsByTitle(subjectId: string, title: string): Promise<string[]>;
  insert(input: NewSource): Promise<string>;
  deleteMany(ids: string[]): Promise<void>;
  countBySubject(subjectId: string): Promise<number>;
  titlesByIds(ids: string[]): Promise<Map<string, string>>;
  /** 교재 PDF 분할용: 쪽 범위가 있는 책 자료 */
  booksWithRange(subjectId: string): Promise<{ id: string; title: string; unitId: string | null; pageRange: string }[]>;
};

export type NewChunk = { sourceId: string; subjectId: string; unitId: string | null; ord: number; page: number | null; heading: string | null; content: string };
/** 임베딩이 필요한 조각 (저장된 모든 열 — upsert 로 다시 쓰기 때문) */
export type PendingChunk = NewChunk & { id: string };

/** DB 검색 함수(match_chunks / search_chunks)가 돌려주는 한 행 */
export type RawHit = {
  chunkId: string;
  sourceId: string;
  unitId: string | null;
  unitNo: number | null;
  page: number | null;
  ord: number;
  heading: string | null;
  content: string;
  kind: string;
  sourceTitle: string;
  sourceUrl: string | null;
  score: number;
  vecRank: number | null;
  kwRank: number | null;
};

export type ChunkRepo = {
  insertMany(rows: NewChunk[]): Promise<void>;
  /** ord 순으로 fromOrd 부터 count 개 + 전체 개수 */
  list(sourceId: string, fromOrd: number, count: number): Promise<{ chunks: Chunk[]; total: number }>;
  /** 어느 쪽(page)의 조각들 (ord 순, 최대 limit) */
  byPage(subjectId: string, page: number, limit: number): Promise<(Chunk & { unitId: string | null })[]>;
  /** K3. 과목에 임베딩된 조각이 하나라도 있나 */
  hasEmbeddings(subjectId: string): Promise<boolean>;
  /** 임베딩이 없거나(force 면 전부) 모델이 다른 조각 (source_id, ord 순) */
  listPending(filter: { subjectId: string } | { sourceId: string }, model: string, force: boolean): Promise<PendingChunk[]>;
  saveEmbeddings(rows: PendingChunk[], vectors: string[], model: string, atIso: string): Promise<void>;
  /** 조각 개수 (model 을 주면 그 모델로 임베딩된 것만) */
  countBySubject(subjectId: string, model?: string): Promise<number>;
  hybridSearch(input: { subjectId: string; embedding: string; tokens: string[]; unitIds: string[] | null; limit: number }): Promise<RawHit[]>;
  keywordSearch(input: { subjectId: string; tokens: string[]; unitIds: string[] | null; limit: number }): Promise<RawHit[]>;
};

/** 교재 PDF 파일 (knowledge.files). 단원별로 잘린 파일은 page_from~page_to, 통째 파일은 name="book" 과 page_offset */
export type SubjectFile = {
  id: string;
  subjectId: string;
  unitId: string | null;
  name: string;
  title: string | null;
  storagePath: string;
  pageOffset: number;
  pageFrom: number | null;
  pageTo: number | null;
  pages: number | null;
};
export type NewSubjectFile = Omit<SubjectFile, "id">;

export type FileRepo = {
  byId(id: string): Promise<SubjectFile | null>;
  /** 교재 쪽수 page 가 든 단원 파일 (page_from 순 첫 번째) */
  findByPage(subjectId: string, page: number): Promise<SubjectFile | null>;
  /** 통째 파일 (name = "book") */
  findWhole(subjectId: string): Promise<SubjectFile | null>;
  upsert(file: NewSubjectFile): Promise<void>;
  delete(id: string): Promise<void>;
};

export type FileStorage = {
  signedUrl(path: string, expiresSec: number): Promise<string | null>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
};

export type TextExtractor = {
  /** txt/md 는 그대로, html 은 평문으로, pdf 는 쪽마다 "[p.N]" 표시를 넣어 텍스트로 */
  extract(filename: string, bytes: Uint8Array): Promise<{ text: string; pageRange: string | null }>;
};

export type PdfSplitter = {
  pageCount(bytes: Uint8Array): Promise<number>;
  /** first..last 쪽(1부터)만 담은 새 PDF */
  slice(bytes: Uint8Array, first: number, last: number): Promise<Uint8Array>;
};

/** 임베딩 제공자. 키가 없으면 deps.embeddings 는 null 이고 검색은 키워드만으로 돈다 */
export type EmbeddingProvider = {
  model: string;
  /** 결과 순서는 입력 순서와 같다 */
  embed(texts: string[]): Promise<number[][]>;
};

export type ChatModel = {
  complete(input: { system: string; userContext: string; messages: { role: "user" | "assistant"; content: string }[] }): Promise<string>;
};

export type ChatLogRepo = {
  insert(row: { userId: string; subjectId: string; questionId: string | null; question: string; answer: string; sources: { label: string; page: number | null }[] }): Promise<void>;
  /** 사용자의 기록 시각들 (sinceIso 이후) */
  timestampsSince(userId: string, sinceIso: string): Promise<string[]>;
  /** 이 문항으로 나눈 최근 대화 limit 건, 오래된 것부터 */
  recentForQuestion(userId: string, questionId: string, limit: number): Promise<{ question: string; answer: string | null }[]>;
};

/** Catalog 가 공급하는 것 (make-deps 에서 CatalogApi 로 구현) */
export type UnitRef = { id: string; no: number | null; title: string; parentId: string | null };
export type QuestionRef = {
  id: string;
  subjectId: string;
  unitId: string | null;
  prompt: string;
  topic: string | null;
  sourceQuote: string | null;
  explanation: string | null;
  correctChoice: number | null;
  choices: { ord: number; text: string }[];
};
export type CatalogPort = {
  questionById(id: string): Promise<QuestionRef | null>;
  listUnits(subjectId: string): Promise<UnitRef[]>;
  subjectName(subjectId: string): Promise<string | null>;
  /** 목차 행으로 단원을 만든다. 같은 부모 아래 같은 no 가 있으면 건너뛴다 */
  ensureUnits(subjectId: string, rows: TocRow[], parentId: string | null): Promise<{ created: number; skipped: number }>;
};

export type KnowledgeDeps = {
  user: CurrentUser | null;
  now: () => Date;
  sources: SourceRepo;
  chunks: ChunkRepo;
  files: FileRepo;
  storage: FileStorage;
  extractor: TextExtractor;
  pdf: PdfSplitter;
  embeddings: EmbeddingProvider | null;
  chatModel: ChatModel | null;
  chatLogs: ChatLogRepo;
  catalog: CatalogPort;
};
