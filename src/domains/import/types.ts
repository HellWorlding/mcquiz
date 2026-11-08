/** 단원 신뢰도가 이 값보다 낮으면 "단원 확인 필요" (클라이언트에서도 쓰므로 여기 둔다) */
export const LOW_CONFIDENCE = 0.4;

export type ParsedChoice = { text: string; explanation: string | null };

export type ParsedQuestion = {
  /** 원문 문항 번호 */
  no: number | null;
  prompt: string;
  choices: ParsedChoice[];
  /** 정답 선지 번호 (1부터) */
  correct: number | null;
  /** 문항 전체 해설 (선지별 해설과 별도) */
  explanation: string | null;
  hint: string | null;
  tags: string[];
  /** 세부 주제 (단원보다 세밀) */
  topic: string | null;
  difficulty: "easy" | "medium" | "hard" | "very_hard" | null;
  /** 오답 선지에 쓴 함정 유형 코드 */
  trapTypes: string[];
  /** 정답 근거가 된 원문 문장 */
  sourceQuote: string | null;
  /** 원문에 표시된 단원 번호 (예: [26강] → 26) */
  unitHint: number | null;
  points: number | null;
  warnings: string[];
};

export type ParseResult = {
  questions: ParsedQuestion[];
  warnings: string[];
  /** 어떤 파서가 처리했는지 */
  format: "json" | "text" | "ai" | "none";
};

/** 미리보기 화면에서 편집되는 문항 (단원 배정 결과 포함) */
export type PreviewQuestion = ParsedQuestion & {
  key: string;
  unitId: string | null;
  unitConfidence: number | null;
  unitCandidates: { unitId: string; score: number }[];
};

export function emptyQuestion(no: number | null = null): ParsedQuestion {
  return {
    no,
    prompt: "",
    choices: [],
    correct: null,
    explanation: null,
    hint: null,
    tags: [],
    topic: null,
    difficulty: null,
    trapTypes: [],
    sourceQuote: null,
    unitHint: null,
    points: null,
    warnings: [],
  };
}
