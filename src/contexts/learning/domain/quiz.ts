import { shuffled } from "./shuffle";
import type { LearningFilter, QuizCount, QuizOrder, QuizScope } from "./types";

/** 주소의 쿼리 문자열(옛 QuizParams) */
export type QuizSearchParams = {
  subject?: string;
  units?: string; // 쉼표 구분
  set?: string;
  collection?: string;
  mode?: string; // wrong | confused | saved | weakmix
  count?: string; // 10 | 20 | 40 | all
  order?: string; // seq | random
  offset?: string; // 순서대로일 때 시작 위치 (0부터)
  ids?: string; // 쉼표 구분 (다시 풀기)
  session?: string; // 이어서 풀기
  difficulty?: string; // easy|medium|hard|very_hard
  /** 풀이 횟수가 이 값 미만인 문항만 (예: 2 → 두 번 이상 안 푼 것) */
  under?: string;
};

export type ParsedQuizParams = {
  /** 이어서 풀기 세션 id. 있으면 나머지는 무시된다 */
  sessionId: string | null;
  subjectId: string | null;
  scope: QuizScope | null;
  filter: LearningFilter;
  /** 약점 섞어 풀기 (저장함에서 count 개 표본) */
  weakMix: boolean;
  order: QuizOrder;
  count: QuizCount;
  difficulty: string | null;
  /** 풀이 횟수 N회 미만만 */
  under: number | null;
  /** 제목 종류 (라벨은 UI·로더가 붙인다) */
  titleKind: "retry" | "weakmix" | "wrong" | "confused" | "saved" | "set" | "collection" | "units" | "subject" | "quiz";
};

const splitIds = (s: string | undefined) => (s ?? "").split(",").filter(Boolean);

/**
 * 옛 QuizParams → 범위(QuizScope) + 필터(LearningFilter) + 순서(QuizOrder) + 개수.
 * 순수 함수: 무작위 seed 는 밖에서 받는다.
 *  - mode=wrong/confused → filter wrong/confused, mode=saved → 저장함 전체(weak), mode=weakmix → weak + random + count(기본 20)
 */
export function parseQuizParams(p: QuizSearchParams, seed: number): ParsedQuizParams {
  const subjectId = p.subject || null;
  const order: QuizOrder = p.order === "random" ? { kind: "random", seed } : { kind: "seq", offset: Math.max(0, Number(p.offset) || 0) };
  const count: QuizCount = p.count && p.count !== "all" ? Math.max(1, Number(p.count) || 20) : "all";
  const underN = Number(p.under);
  const under = Number.isInteger(underN) && underN > 0 ? underN : null;
  const difficulty = p.difficulty || null;
  const base = { sessionId: p.session || null, subjectId, difficulty, under };

  if (p.session) return { ...base, scope: null, filter: "all", weakMix: false, order, count, titleKind: "quiz" };
  if (p.ids) return { ...base, scope: { kind: "ids", ids: splitIds(p.ids) }, filter: "all", weakMix: false, order, count, titleKind: "retry" };
  if (p.mode === "weakmix" && subjectId) {
    const n = count === "all" ? 20 : count;
    return { ...base, scope: { kind: "subject", subjectId }, filter: "weak", weakMix: true, order: { kind: "random", seed }, count: n, titleKind: "weakmix" };
  }
  if ((p.mode === "wrong" || p.mode === "confused" || p.mode === "saved") && subjectId) {
    const filter: LearningFilter = p.mode === "saved" ? "weak" : p.mode;
    return { ...base, scope: { kind: "subject", subjectId }, filter, weakMix: false, order, count, titleKind: p.mode };
  }
  if (p.set) return { ...base, scope: { kind: "set", setId: p.set }, filter: "all", weakMix: false, order, count, titleKind: "set" };
  if (p.collection) return { ...base, scope: { kind: "collection", collectionId: p.collection }, filter: "all", weakMix: false, order, count, titleKind: "collection" };
  if (p.units && subjectId) return { ...base, scope: { kind: "units", subjectId, unitIds: splitIds(p.units) }, filter: "all", weakMix: false, order, count, titleKind: "units" };
  if (subjectId) return { ...base, scope: { kind: "subject", subjectId }, filter: "all", weakMix: false, order, count, titleKind: "subject" };
  return { ...base, scope: null, filter: "all", weakMix: false, order, count, titleKind: "quiz" };
}

/** 순서·개수 적용: 무작위면 seed 로 섞은 뒤 앞에서 count 개, 순서대로면 offset 부터 count 개 */
export function pickByOrder(ids: readonly string[], order: QuizOrder, count: QuizCount): string[] {
  if (order.kind === "random") {
    const s = shuffled(ids, order.seed);
    return count === "all" ? s : s.slice(0, count);
  }
  if (count === "all") return order.offset > 0 ? ids.slice(order.offset) : [...ids];
  return ids.slice(order.offset, order.offset + count);
}

/** 소요 시간은 0..3600 초로 자른다 (L1) */
export function clampElapsed(sec: number | null | undefined): number | null {
  return sec == null ? null : Math.max(0, Math.min(3600, Math.round(sec)));
}
