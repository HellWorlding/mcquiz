import type { CurrentUser } from "@/contexts/access";
import type { Choice, Collection, CollectionScope, Question, QuestionSet, Subject, Unit, Visibility } from "../domain/types";
import type { ParsedQuestion, ParseResult } from "../domain/import/types";
import type { UnitCandidate } from "../domain/import/classify";

export type SubjectRepo = {
  /** publicOnly: 게스트(service role 로 읽을 때)는 공개 과목만 */
  list(opts: { publicOnly: boolean }): Promise<Subject[]>;
  byId(id: string, opts: { publicOnly: boolean }): Promise<Subject | null>;
  byName(name: string): Promise<Subject | null>;
  create(name: string, visibility: Visibility): Promise<Subject>;
  setVisibility(id: string, visibility: Visibility): Promise<void>;
};

export type UnitInsert = { subjectId: string; parentId: string | null; title: string; no: number | null; sort: number };

export type UnitRepo = {
  list(subjectId: string): Promise<Unit[]>;
  byId(id: string): Promise<Unit | null>;
  insert(row: UnitInsert): Promise<Unit>;
  /** 이미 있는 (부모, no) 는 건너뛴다 */
  insertMany(rows: UnitInsert[]): Promise<void>;
  update(id: string, patch: Partial<Pick<Unit, "title" | "sort" | "priority">>): Promise<void>;
  delete(id: string): Promise<void>;
  /** 선택한 단원과 그 하위 단원 id (catalog.unit_subtree) */
  subtree(rootIds: string[]): Promise<string[]>;
  /** 단원별 문항 수. 단원 없는 문항은 null 키 */
  questionCounts(subjectId: string): Promise<{ unitId: string | null; n: number }[]>;
  /** Postgres 키워드 매칭 (catalog.classify_unit — knowledge.sources 를 SQL 안에서 읽는다) */
  classify(subjectId: string, tokens: string[]): Promise<UnitCandidate[]>;
};

export type QuestionPatch = Partial<Pick<Question, "prompt" | "unitId" | "unitConfidence" | "correctChoice" | "needsReview" | "explanation" | "hint" | "tags">>;
export type ChoicePatch = Partial<Pick<Choice, "text" | "explanation">>;

export type QuestionInsert = {
  subjectId: string;
  unitId: string | null;
  unitConfidence: number | null;
  prompt: string;
  choices: Choice[];
  correct: number | null;
  explanation: string | null;
  hint: string | null;
  tags: string[];
  points: number | null;
  topic: string | null;
  difficulty: string | null;
  trapTypes: string[];
  sourceQuote: string | null;
  sourcePage: number | null;
  /** 저장할 검토 필요 값 (needsReviewOf 로 정한다 — 정답 없음이면 true) */
  needsReview: boolean;
};

/**
 * 반입 계획(planImport 결과)을 한 번에 적용하는 쓰기. 판정(검증·중복)은 application 에서 끝난 뒤다.
 * 구현은 원자적이어야 한다: 하나라도 실패하면 세트·문항·선지·덮어쓰기가 하나도 남지 않는다 (M4).
 */
export type ImportWrite = {
  subjectId: string;
  /** 새 문항이 들어갈 세트. id 가 null 이면 새 문항이 있을 때만 새로 만든다 */
  set: { id: string | null; title: string; sourceFilename: string | null; createdBy: string | null };
  inserts: (QuestionInsert & { ord: number })[];
  /** 기존 문항 덮어쓰기 (선지 포함). 세트·번호는 바꾸지 않는다 */
  updates: { id: string; q: QuestionInsert }[];
};

/** setId: 새 세트(또는 지정한 세트), 새 문항이 없으면 첫 덮어쓴 문항의 세트, 둘 다 없으면 null */
export type ImportWriteResult = { setId: string | null; inserted: number; updated: number };

export type QuestionRepo = {
  /** 선지 포함, ord 순 정렬. 순서는 호출자가 맞춘다 */
  byIds(ids: string[]): Promise<Question[]>;
  idsBySet(setId: string): Promise<string[]>;
  /** 세트 순서 → 번호 순서로 정렬된 문항 (단원 범위) */
  idsInUnits(subjectId: string, unitIds: string[]): Promise<{ id: string; unitId: string | null }[]>;
  idsInSubject(subjectId: string): Promise<string[]>;
  search(subjectId: string, text: string, limit: number): Promise<Pick<Question, "id" | "unitId" | "ord" | "prompt" | "topic">[]>;
  /** 과목의 문항 중 질문문이 목록에 있는 것 */
  findByPrompts(subjectId: string, prompts: string[]): Promise<{ id: string; unitId: string | null; prompt: string }[]>;
  /** 세트들에 든 문항의 (단원, 번호) */
  findBySets(setIds: string[]): Promise<{ id: string; unitId: string | null; ord: number }[]>;
  /** 과목의 첫 문항 (출제 안내 예시용) */
  sampleOf(subjectId: string): Promise<Question | null>;
  update(id: string, patch: QuestionPatch): Promise<void>;
  updateChoice(questionId: string, ord: number, patch: ChoicePatch): Promise<void>;
  delete(id: string): Promise<void>;
  /** 반입 계획 적용 (세트 생성 + 새 문항 + 덮어쓰기, 한 트랜잭션). 실패하면 throw */
  applyImport(write: ImportWrite): Promise<ImportWriteResult>;
};

export type SetRepo = {
  list(subjectId: string): Promise<QuestionSet[]>;
  /** 모든 과목의 세트 (관리자 화면) */
  listAll(): Promise<QuestionSet[]>;
  byId(id: string): Promise<QuestionSet | null>;
  idsBySourceFilename(subjectId: string, filename: string): Promise<string[]>;
  delete(id: string): Promise<void>;
};

export type CollectionRepo = {
  list(subjectId: string): Promise<Collection[]>;
  byId(id: string): Promise<Collection | null>;
  /** 하위 묶음 계산용 — 읽을 수 있는 모든 묶음의 (id, parentId) */
  allRefs(): Promise<Pick<Collection, "id" | "parentId">[]>;
  /** 묶음들의 문항 id (added_at 순, 중복 포함) */
  itemIds(collectionIds: string[]): Promise<string[]>;
  itemCounts(subjectId: string): Promise<Map<string, number>>;
  create(row: { subjectId: string; parentId: string | null; title: string; scope: CollectionScope; createdBy: string }): Promise<Collection>;
  rename(id: string, title: string): Promise<void>;
  delete(id: string): Promise<void>;
  addItems(collectionId: string, questionIds: string[]): Promise<void>;
  removeItem(collectionId: string, questionId: string): Promise<void>;
};

/** OpenAI 보조 (선택). 키가 없으면 deps.ai 는 null */
export type AiParser = {
  parseQuestions(text: string): Promise<ParseResult | null>;
  classifyUnit(input: { subjectId: string; units: Unit[]; question: ParsedQuestion; candidateUnitIds: string[] }): Promise<{ unitId: string; confidence: number } | null>;
};

/** 파일 → 텍스트 (pdf/html/txt). 반입 파일을 읽을 때 */
export type TextExtractor = (filename: string, bytes: Uint8Array) => Promise<string>;

export type CatalogDeps = {
  user: CurrentUser | null;
  subjects: SubjectRepo;
  units: UnitRepo;
  questions: QuestionRepo;
  sets: SetRepo;
  collections: CollectionRepo;
  ai: AiParser | null;
  extractText: TextExtractor;
};
