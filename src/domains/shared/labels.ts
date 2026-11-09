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
  scope_change: "범위 확대·축소",
  subject_change: "주체 변경",
  modality_change: "할 수 있다↔해야 한다",
  partial_truth: "절반만 맞음",
  reversal: "순서·관계 뒤집기",
  stage_mixup: "다른 단계 내용",
  law_article_mixup: "조항·법률 혼동",
  plausible_synonym: "비슷한 용어",
  missing_add_on: "빠뜨린 조건",
};
export const TRAP_TYPES = Object.keys(TRAP_LABELS);

/** 선지 해설의 "(정답)" 표시는 화면에서 숨긴다 (정답 선지는 색으로 구분) */
export const cleanExplanation = (text: string | null | undefined) =>
  text ? text.replace(/\(\s*정답\s*\)\s*/g, "").replace(/\s{2,}/g, " ").trim() : null;

export const DIFFICULTY_LABELS_EN: Record<string, string> = { easy: "easy", medium: "medium", hard: "hard", very_hard: "very hard" };
export const TRAP_LABELS_EN: Record<string, string> = {
  concept_swap: "concept swap",
  number_change: "number change",
  scope_change: "scope change",
  subject_change: "subject change",
  modality_change: "may ↔ must",
  partial_truth: "partly true",
  reversal: "reversed order/relation",
  stage_mixup: "wrong stage",
  law_article_mixup: "article/law mix-up",
  plausible_synonym: "look-alike term",
  missing_add_on: "missing condition",
};
export const difficultyLabel = (d: string | null | undefined, lang: "ko" | "en" = "ko") =>
  d ? ((lang === "en" ? DIFFICULTY_LABELS_EN[d] : DIFFICULTY_LABELS[d]) ?? d) : null;
export const trapLabel = (t: string, lang: "ko" | "en" = "ko") => (lang === "en" ? TRAP_LABELS_EN[t] : TRAP_LABELS[t]) ?? t;
