/** Catalog 도메인 타입 (PRD-04 §4). DB 행이 아니라 camelCase 엔티티 */
export type Visibility = "public" | "restricted";
export type CollectionScope = "shared" | "private";

export type Subject = { id: string; name: string; visibility: Visibility; createdAt: string };

export type Unit = {
  id: string;
  subjectId: string;
  parentId: string | null;
  no: number | null;
  title: string;
  sort: number;
  /** 시작 화면 배지 1~5 */
  priority: number | null;
};

/** 선지. 해설은 선지 객체에 붙어 함께 이동한다 (C2) */
export type Choice = { ord: number; text: string; explanation: string | null };

export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

export type Question = {
  id: string;
  subjectId: string;
  unitId: string | null;
  setId: string | null;
  ord: number;
  prompt: string;
  choices: Choice[];
  correctChoice: number | null;
  explanation: string | null;
  hint: string | null;
  topic: string | null;
  difficulty: string | null;
  trapTypes: string[];
  tags: string[];
  points: number | null;
  needsReview: boolean;
  unitConfidence: number | null;
  sourceQuote: string | null;
  sourcePage: number | null;
};

export type QuestionSet = {
  id: string;
  subjectId: string;
  title: string;
  sourceFilename: string | null;
  createdBy: string | null;
  createdAt: string;
  questionCount?: number;
};

export type Collection = {
  id: string;
  subjectId: string;
  parentId: string | null;
  title: string;
  sort: number;
  scope: CollectionScope;
  createdBy: string;
};

/** 퀴즈 범위 → 문항 id 목록으로 바꿀 때 쓰는 범위 */
export type QuestionScope =
  | { kind: "subject"; subjectId: string }
  | { kind: "units"; subjectId: string; unitIds: string[] }
  | { kind: "set"; setId: string }
  | { kind: "collection"; collectionId: string }
  | { kind: "ids"; ids: string[] };
