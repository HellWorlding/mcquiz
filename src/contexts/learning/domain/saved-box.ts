import { difficultyLabel, trapLabel } from "@/shared/labels";
import type { GroupStat, LearningFilter, LearningUnit, QuestionStat, SavedBoxSummary, SavedItem } from "./types";

/** 통계가 없는(안 푼) 문항의 빈 집계 */
export function emptyStat(questionId: string, meta: Partial<Pick<QuestionStat, "unitId" | "setId" | "tags" | "topic" | "difficulty" | "trapTypes">> = {}): QuestionStat {
  return {
    questionId,
    unitId: meta.unitId ?? null,
    setId: meta.setId ?? null,
    tags: meta.tags ?? [],
    topic: meta.topic ?? null,
    difficulty: meta.difficulty ?? null,
    trapTypes: meta.trapTypes ?? [],
    attemptCount: 0,
    wrongCount: 0,
    lastCorrect: null,
    lastGradedAt: null,
    wrongAfter: false,
    confusedAfter: false,
    saved: false,
    lastWeakAt: null,
  };
}

/**
 * L4. 필터 한 개를 문항 집계에 적용한다.
 * weak(약점) = 틀림(빼기 이후) ∪ 헷갈림(빼기 이후) ∪ 직접 저장. 저장함 목록은 이 weak 집합이다.
 * 통계가 없으면(s 없음) 안 푼 문항이다.
 */
export function matchesFilter(s: QuestionStat | undefined, f: LearningFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "unsolved":
      return !s || s.attemptCount === 0;
    case "wrong":
      return !!s?.wrongAfter;
    case "repeat":
      return (s?.wrongCount ?? 0) >= 2;
    case "confused":
      return !!s?.confusedAfter;
    case "saved":
      return !!s?.saved;
    case "weak":
      return !!(s?.wrongAfter || s?.confusedAfter || s?.saved);
  }
}

/** L4. 집계 목록에서 필터에 맞는 것만. 정렬은 많이 틀린 순 → 최근 약점 순 → 원래 순서 */
export function savedBoxFilter(stats: readonly QuestionStat[], filter: LearningFilter): QuestionStat[] {
  return stats
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => matchesFilter(s, filter))
    .sort((a, b) => b.s.wrongCount - a.s.wrongCount || (b.s.lastWeakAt ?? "").localeCompare(a.s.lastWeakAt ?? "") || a.i - b.i)
    .map(({ s }) => s);
}

/** 저장함 목록 항목 (이유 배지 포함). 많이 틀린 순 → 최근 순 */
export function savedBoxItems(stats: readonly QuestionStat[]): SavedItem[] {
  const out: SavedItem[] = [];
  for (const s of stats) {
    const reasons: SavedItem["reasons"] = [];
    if (s.wrongAfter) reasons.push("wrong");
    if (s.confusedAfter) reasons.push("confused");
    if (s.saved) reasons.push("saved");
    if (reasons.length === 0) continue;
    out.push({
      questionId: s.questionId,
      wrongCount: s.wrongCount,
      lastResult: s.lastCorrect,
      confused: s.confusedAfter,
      saved: s.saved,
      reasons,
      lastAt: s.lastWeakAt ?? "",
      lastGradedAt: s.lastGradedAt,
    });
  }
  return out.sort((a, b) => b.wrongCount - a.wrongCount || (b.lastAt > a.lastAt ? 1 : -1));
}

/** 저장함 화면 요약: 목록 + 단원·주제·난이도·함정·세트·태그별 정답률 */
export function summarizeSavedBox(stats: readonly QuestionStat[], units: readonly LearningUnit[], sets: readonly { id: string; title: string }[]): SavedBoxSummary {
  const items = savedBoxItems(stats);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const topOf = (unitId: string | null): string | null => {
    let cur = unitId ? unitById.get(unitId) : undefined;
    while (cur && cur.parent_id) cur = unitById.get(cur.parent_id);
    return cur?.id ?? null;
  };
  const unitLabel = (id: string) => {
    const u = unitById.get(id);
    if (!u) return "단원 미지정";
    const own = u.no !== null ? `${u.no}. ${u.title}` : u.title;
    const parent = u.parent_id ? unitById.get(u.parent_id) : null;
    return parent ? `${parent.title} › ${own}` : own;
  };
  const setTitle = new Map(sets.map((s) => [s.id, s.title]));

  const agg = (keyOf: (s: QuestionStat) => string[], labelOf: (k: string) => string): GroupStat[] => {
    const acc = new Map<string, { total: number; correct: number; weak: number }>();
    for (const s of stats) {
      for (const k of keyOf(s)) {
        const g = acc.get(k) ?? { total: 0, correct: 0, weak: 0 };
        if (s.attemptCount > 0) {
          g.total++;
          if (s.lastCorrect) g.correct++;
        }
        g.weak += s.wrongCount + (s.confusedAfter ? 1 : 0);
        acc.set(k, g);
      }
    }
    return [...acc.entries()]
      .filter(([, s]) => s.total > 0 || s.weak > 0)
      .map(([key, s]) => ({ key, label: labelOf(key), total: s.total, correct: s.correct, accuracy: s.total ? s.correct / s.total : 0, weak: s.weak }))
      .sort((a, b) => b.weak - a.weak || a.accuracy - b.accuracy || b.total - a.total);
  };
  const graded = stats.filter((s) => s.attemptCount > 0);
  const attemptCounts: Record<string, number> = {};
  for (const s of stats) attemptCounts[s.questionId] = s.attemptCount;
  return {
    items,
    wrongIds: items.filter((i) => i.reasons.includes("wrong")).map((i) => i.questionId),
    confusedIds: items.filter((i) => i.reasons.includes("confused")).map((i) => i.questionId),
    byGroup: agg((s) => [topOf(s.unitId) ?? "__none__"], (k) => unitById.get(k)?.title ?? "단원 미지정"),
    byUnit: agg((s) => [s.unitId ?? "__none__"], (k) => (k === "__none__" ? "단원 미지정" : unitLabel(k))),
    byTopic: agg((s) => (s.topic ? [s.topic] : []), (k) => k),
    byDifficulty: agg((s) => (s.difficulty ? [s.difficulty] : []), (k) => difficultyLabel(k) ?? k),
    byTrap: agg((s) => s.trapTypes ?? [], (k) => trapLabel(k)),
    bySet: agg((s) => (s.setId ? [s.setId] : []), (k) => setTitle.get(k) ?? "세트"),
    byTag: agg((s) => s.tags ?? [], (k) => `#${k}`),
    totalAttempts: graded.length,
    accuracy: graded.length ? graded.filter((s) => s.lastCorrect).length / graded.length : 0,
    attemptCounts,
  };
}
