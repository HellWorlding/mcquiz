/** 화면에 보여 줄 한국어 라벨 (DB 에는 영어 코드로 저장) */
export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "하",
  medium: "중",
  hard: "상",
  very_hard: "최상",
};
export const DIFFICULTIES = ["easy", "medium", "hard", "very_hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const TRAP_LABELS: Record<string, string> = {
  concept_swap: "개념 바꿔치기",
  number_change: "숫자 변경",
  scope_change: "범위 변경",
  subject_change: "주체 변경",
  modality_change: "의무·재량 변경",
  partial_truth: "부분만 맞음",
  reversal: "뒤집기",
  stage_mixup: "단계 뒤섞기",
  law_article_mixup: "조문 뒤섞기",
  plausible_synonym: "그럴듯한 유사어",
  missing_add_on: "조건 누락",
};
export const TRAP_TYPES = Object.keys(TRAP_LABELS);

export const difficultyLabel = (d: string | null | undefined) => (d ? (DIFFICULTY_LABELS[d] ?? d) : null);
export const trapLabel = (t: string) => TRAP_LABELS[t] ?? t;
