/** Learning 도메인 값 객체·엔티티 타입 (순수). 용어는 docs/glossary.md §3 */

export type QuestionId = string;
export type UnitId = string;
export type SubjectId = string;
export type AttemptId = string;
export type SessionId = string;

/** 범위: 무엇을 풀지 */
export type QuizScope =
  | { kind: "subject"; subjectId: SubjectId }
  | { kind: "units"; subjectId: SubjectId; unitIds: UnitId[] }
  | { kind: "set"; setId: string }
  | { kind: "collection"; collectionId: string }
  | { kind: "ids"; ids: QuestionId[] };

/** 필터: 풀이 기록 기준 선택 */
export const LEARNING_FILTERS = ["all", "unsolved", "wrong", "repeat", "confused", "saved", "weak"] as const;
export type LearningFilter = (typeof LEARNING_FILTERS)[number];
export const isLearningFilter = (v: unknown): v is LearningFilter => typeof v === "string" && (LEARNING_FILTERS as readonly string[]).includes(v);

/** 순서: 순서대로(offset 부터) 또는 무작위(seed) */
export type QuizOrder = { kind: "seq"; offset: number } | { kind: "random"; seed: number };
export type QuizCount = number | "all";

/** 진행 상태(QuizSession)에 저장되는 문항 상태. 아직 답하지 않은 문항도 시간만 들고 있을 수 있다 */
export type SessionAnswer = { selectedOrd: number | null; isCorrect: boolean | null; confused: boolean; elapsedSec?: number | null };

export type QuizSession = {
  id: SessionId;
  userId: string;
  subjectId: SubjectId | null;
  title: string;
  questionIds: QuestionId[];
  position: number;
  answers: Record<QuestionId, SessionAnswer>;
  finished: boolean;
  updatedAt: string;
};

/** 이어서 풀기 목록의 한 줄 */
export type UnfinishedSession = { id: SessionId; title: string; position: number; total: number; updatedAt: string };

/** 풀이 (추가 전용) */
export type Attempt = {
  id: AttemptId;
  questionId: QuestionId;
  selectedOrd: number | null;
  isCorrect: boolean | null;
  confused: boolean;
  elapsedSec: number | null;
  createdAt: string;
};

export type MarkKind = "saved" | "dismissed";

/** 사용자×문항 집계 (SQL learning.question_stats 한 행). 풀었거나 표시한 문항만 들어 있다 */
export type QuestionStat = {
  questionId: QuestionId;
  unitId: UnitId | null;
  setId: string | null;
  tags: string[];
  topic: string | null;
  difficulty: string | null;
  trapTypes: string[];
  attemptCount: number;
  wrongCount: number;
  lastCorrect: boolean | null;
  lastGradedAt: string | null;
  /** 마지막 "빼기" 이후에 틀린 적이 있다 */
  wrongAfter: boolean;
  /** 마지막 "빼기" 이후에 헷갈림 표시가 있다 */
  confusedAfter: boolean;
  /** 직접 저장 (빼기보다 나중이면 true) */
  saved: boolean;
  lastWeakAt: string | null;
};

/** k회독 점수: 단원별 k번째 풀이의 n / 정답 수 */
export type RoundScore = { unitId: UnitId | null; roundNo: number; n: number; nCorrect: number };
/** 문항별 "몇 번 풀었나" 분포 (옛 my_unit_rounds) */
export type UnitAttemptCount = { unitId: UnitId | null; attempts: number; n: number; nCorrect: number };
/** 끝내지 않은 세션별·단원별 진행 */
export type UnitProgressRow = { sessionId: SessionId; unitId: UnitId | null; covered: number; answered: number };
export type SubjectActivity = { subjectId: SubjectId; weakCount: number; attemptCount: number; lastAt: string | null };

/** unit_id → 회독 k → { n, correct } (화면용) */
export type UnitRoundScores = Record<string, Record<number, { n: number; correct: number }>>;
/** unit_id → 풀이 횟수 k → { n, correct } (화면용) */
export type UnitAttemptCounts = Record<string, Record<number, { n: number; correct: number }>>;

/** 선지: 해설은 선지 객체에 붙어 함께 움직인다 */
export type QuizChoice = { ord: number; text: string; explanation: string | null };

/**
 * 풀이 화면이 쓰는 문항 모양. Catalog 의 Question 을 어댑터가 이 모양으로 바꿔 준다.
 * 공유 UI(QuestionMeta)·트리 유틸이 snake_case 를 쓰므로 여기서도 snake_case 로 둔다.
 */
export type QuizQuestion = {
  id: QuestionId;
  subject_id: SubjectId;
  unit_id: UnitId | null;
  set_id: string | null;
  ord: number;
  prompt: string;
  correct_choice: number | null;
  explanation: string | null;
  hint: string | null;
  topic: string | null;
  difficulty: string | null;
  trap_types: string[];
  tags: string[];
  points: number | null;
  needs_review: boolean;
  source_quote: string | null;
  source_page: number | null;
  /** 웹 자료 출처 (있으면 내보내기에 실린다) */
  source_url?: string | null;
  choices: QuizChoice[];
};

/** 단원 (Catalog 에서 받아 온 평면 목록). 트리 유틸(shared/tree)이 snake_case 를 요구한다 */
export type LearningUnit = { id: UnitId; parent_id: UnitId | null; no: number | null; title: string; sort: number; priority: number | null };

/** 저장함 목록의 한 항목 */
export type SavedItem = {
  questionId: QuestionId;
  wrongCount: number;
  lastResult: boolean | null;
  confused: boolean;
  saved: boolean;
  reasons: ("wrong" | "confused" | "saved")[];
  lastAt: string;
  /** 마지막으로 답을 고른 시각 (ISO). 한 번도 안 풀었으면 null */
  lastGradedAt: string | null;
};

export type GroupStat = { key: string; label: string; total: number; correct: number; accuracy: number; /** 오답·헷갈림 횟수 */ weak: number };

/** 저장함 화면 요약 (옛 WeakSummary) */
export type SavedBoxSummary = {
  items: SavedItem[];
  wrongIds: QuestionId[];
  confusedIds: QuestionId[];
  /** 최상위 묶음별 (예: 콜로케이션 / 어휘). key = 최상위 단원 id */
  byGroup: GroupStat[];
  byUnit: GroupStat[];
  byTopic: GroupStat[];
  byDifficulty: GroupStat[];
  byTrap: GroupStat[];
  bySet: GroupStat[];
  byTag: GroupStat[];
  totalAttempts: number;
  accuracy: number;
  attemptCounts: Record<QuestionId, number>;
};

/** 메모 화면의 한 항목 */
export type NoteItem = {
  questionId: QuestionId;
  content: string;
  updatedAt: string;
  prompt: string;
  subjectId: SubjectId;
  unitId: UnitId | null;
  unitLabel: string;
  /** 대단원(최상위 단원) id·이름. 트리가 아니면 null */
  groupId: string | null;
  groupLabel: string | null;
  /** "1강 7번" */
  noLabel: string;
  topic: string | null;
  correctText: string | null;
  correctExplanation: string | null;
  explanation: string | null;
  sourceQuote: string | null;
  sourcePage: number | null;
};

/** 이어서 풀기일 때 풀이 화면에 넘기는 저장된 진행 상태 */
export type ResumeState = { id: SessionId; position: number; answers: Record<QuestionId, SessionAnswer> };
