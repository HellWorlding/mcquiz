import type { CurrentUser } from "@/contexts/access";
import type {
  Attempt,
  LearningUnit,
  MarkKind,
  QuestionStat,
  QuizQuestion,
  QuizScope,
  QuizSession,
  RoundScore,
  SubjectActivity,
  UnfinishedSession,
  UnitAttemptCount,
  UnitProgressRow,
} from "../domain/types";

export type NewAttempt = { userId: string; questionId: string; selectedOrd: number | null; isCorrect: boolean | null; confused: boolean; elapsedSec: number | null };

export type AttemptRepo = {
  add(a: NewAttempt): Promise<string>;
  /** 자기 풀이에 한해 confused 만 바꾼다 (L1) */
  setConfused(attemptId: string, userId: string, confused: boolean): Promise<void>;
  /** 내 풀이 (내보내기용). created_at 순 */
  listForQuestions(userId: string, questionIds: string[]): Promise<Attempt[]>;
};

export type SessionRow = { subjectId: string | null; title: string; questionIds: string[]; position: number; answers: Record<string, unknown>; finished: boolean; updatedAt: string };
export type SessionRepo = {
  get(id: string): Promise<QuizSession | null>;
  listUnfinished(subjectId: string, limit: number): Promise<UnfinishedSession[]>;
  insert(userId: string, row: SessionRow): Promise<string>;
  update(id: string, userId: string, row: SessionRow): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
};

export type MarkRepo = {
  upsert(userId: string, questionIds: string[], kind: MarkKind, at: string): Promise<void>;
  remove(userId: string, questionIds: string[], kind: MarkKind): Promise<void>;
  /** 주어진 문항 중 kind 표시가 있는 문항 id */
  listMarked(userId: string, questionIds: string[], kind: MarkKind): Promise<string[]>;
};

export type NoteRow = { questionId: string; content: string; updatedAt: string };
export type NoteRepo = {
  upsert(userId: string, questionId: string, content: string, at: string): Promise<void>;
  remove(userId: string, questionId: string): Promise<void>;
  forQuestions(userId: string, questionIds: string[]): Promise<Map<string, string>>;
  /** 내 메모 전부, 최근 수정 순 */
  listAll(userId: string): Promise<NoteRow[]>;
};

/** SQL 함수로 만든 읽기 모델 (learning.question_stats 등). RLS 가 적용된 클라이언트로 읽는다 */
export type StatsReadModel = {
  questionStats(subjectId: string): Promise<QuestionStat[]>;
  unsolvedQuestions(subjectId: string): Promise<{ id: string; unitId: string | null; setId: string | null; tags: string[] }[]>;
  unitProgress(subjectId: string): Promise<UnitProgressRow[]>;
  unitAttemptCounts(subjectId: string): Promise<UnitAttemptCount[]>;
  unitRoundScores(subjectId: string): Promise<RoundScore[]>;
  subjectActivity(): Promise<SubjectActivity[]>;
};

export type CatalogScope = Exclude<QuizScope, { kind: "ids" }>;

/** Catalog 공개 API 어댑터: 문항 본문·범위 해석·단원·과목. Learning 은 catalog 테이블을 직접 읽지 않는다 */
export type CatalogQuestions = {
  /** 선지 포함, ids 순서. 읽을 수 없는 문항은 빠진다 (L6) */
  questionsByIds(ids: string[]): Promise<QuizQuestion[]>;
  /** 범위의 문항 id (정렬 보장) */
  questionIds(scope: CatalogScope): Promise<string[]>;
  listUnits(subjectId: string): Promise<LearningUnit[]>;
  listSets(subjectId: string): Promise<{ id: string; title: string }[]>;
  getSubject(id: string): Promise<{ id: string; name: string } | null>;
};

export type Clock = { now(): string };
export type Rng = { seed(): number };

export type LearningDeps = {
  user: CurrentUser | null;
  attempts: AttemptRepo;
  sessions: SessionRepo;
  marks: MarkRepo;
  notes: NoteRepo;
  stats: StatsReadModel;
  catalog: CatalogQuestions;
  clock: Clock;
  rng: Rng;
};
