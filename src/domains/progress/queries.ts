import "server-only";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import { shuffled } from "@/domains/quiz/shuffle";
import { difficultyLabel, trapLabel } from "@/domains/shared/labels";
import { allRows } from "@/domains/shared/paginate";

type QMeta = { id: string; unit_id: string | null; set_id: string; tags: string[]; topic: string | null; difficulty: string | null; trap_types: string[] };
/** my_question_stats 한 행: 문항당 내 기록 요약 (DB 에서 집계) */
type Stat = {
  question_id: string;
  attempt_count: number;
  wrong_count: number;
  last_correct: boolean | null;
  last_graded_at: string | null;
  wrong_after: boolean;
  confused_after: boolean;
  saved: boolean;
  last_weak_at: string | null;
};

export type GroupStat = { key: string; label: string; total: number; correct: number; accuracy: number; /** 오답·헷갈림 횟수 */ weak: number };

/** 저장된 문제 목록의 한 항목 */
export type SavedItem = {
  questionId: string;
  wrongCount: number;
  lastResult: boolean | null;
  confused: boolean;
  saved: boolean;
  reasons: ("wrong" | "confused" | "saved")[];
  lastAt: string;
};

export type WeakSummary = {
  items: SavedItem[];
  wrongIds: string[];
  confusedIds: string[];
  /** 최상위 묶음별 (예: 콜로케이션 / 어휘) */
  byGroup: GroupStat[];
  byUnit: GroupStat[];
  byTopic: GroupStat[];
  byDifficulty: GroupStat[];
  byTrap: GroupStat[];
  bySet: GroupStat[];
  byTag: GroupStat[];
  totalAttempts: number;
  accuracy: number;
  /** 문항별 풀이 횟수 (N회 미만 필터용) */
  attemptCounts: Record<string, number>;
};

/** 주제의 문항 메타 + 내 기록 집계. 기록은 DB 함수가 문항 단위로 요약해 돌려준다. */
async function loadProgress(subjectId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await createClient();
  const [qs, statsRes, { data: units }, { data: sets }] = await Promise.all([
    allRows<QMeta>((f, t) => db.from("questions").select("id, unit_id, set_id, tags, topic, difficulty, trap_types").eq("subject_id", subjectId).range(f, t)),
    db.rpc("my_question_stats", { p_subject: subjectId }),
    db.from("units").select("id, title, no, parent_id, sort").eq("subject_id", subjectId),
    db.from("question_sets").select("id, title").eq("subject_id", subjectId),
  ]);
  const meta = new Map<string, QMeta>(qs.map((q) => [q.id, q]));
  const stats = new Map<string, Stat>(((statsRes.data ?? []) as Stat[]).map((s) => [s.question_id, s]));
  return { user, db, meta, stats, units: units ?? [], sets: sets ?? [] };
}

function buildSavedItems(stats: Map<string, Stat>): SavedItem[] {
  const out: SavedItem[] = [];
  for (const s of stats.values()) {
    const reasons: SavedItem["reasons"] = [];
    if (s.wrong_after) reasons.push("wrong");
    if (s.confused_after) reasons.push("confused");
    if (s.saved) reasons.push("saved");
    if (reasons.length === 0) continue;
    out.push({
      questionId: s.question_id,
      wrongCount: s.wrong_count,
      lastResult: s.last_correct,
      confused: s.confused_after,
      saved: s.saved,
      reasons,
      lastAt: s.last_weak_at ?? "",
    });
  }
  return out.sort((a, b) => b.wrongCount - a.wrongCount || (b.lastAt > a.lastAt ? 1 : -1));
}

/** 풀이 횟수만 필요할 때 (퀴즈 범위 필터) */
export async function getAttemptCounts(subjectId: string): Promise<Record<string, number>> {
  const user = await getCurrentUser();
  if (!user) return {};
  const db = await createClient();
  const { data } = await db.rpc("my_question_stats", { p_subject: subjectId });
  const out: Record<string, number> = {};
  for (const s of (data ?? []) as Stat[]) out[s.question_id] = s.attempt_count;
  return out;
}

export async function getWeakSummary(subjectId: string): Promise<WeakSummary | null> {
  const p = await loadProgress(subjectId);
  if (!p) return null;
  const items = buildSavedItems(p.stats);

  // 단원 라벨과 최상위 묶음
  const unitById = new Map(p.units.map((u) => [u.id, u]));
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
  const setTitle = new Map(p.sets.map((s) => [s.id, s.title]));

  const agg = (keyOf: (m: QMeta) => string[], labelOf: (k: string) => string): GroupStat[] => {
    const acc = new Map<string, { total: number; correct: number; weak: number }>();
    const get = (k: string) => {
      const s = acc.get(k) ?? { total: 0, correct: 0, weak: 0 };
      acc.set(k, s);
      return s;
    };
    for (const s of p.stats.values()) {
      const m = p.meta.get(s.question_id);
      if (!m) continue;
      for (const k of keyOf(m)) {
        const g = get(k);
        if (s.attempt_count > 0) {
          g.total++;
          if (s.last_correct) g.correct++;
        }
        g.weak += s.wrong_count + (s.confused_after ? 1 : 0);
      }
    }
    return [...acc.entries()]
      .filter(([, s]) => s.total > 0 || s.weak > 0)
      .map(([key, s]) => ({ key, label: labelOf(key), total: s.total, correct: s.correct, accuracy: s.total ? s.correct / s.total : 0, weak: s.weak }))
      .sort((a, b) => b.weak - a.weak || a.accuracy - b.accuracy || b.total - a.total);
  };
  const graded = [...p.stats.values()].filter((s) => s.attempt_count > 0);
  const attemptCounts: Record<string, number> = {};
  for (const s of p.stats.values()) attemptCounts[s.question_id] = s.attempt_count;
  return {
    items,
    wrongIds: items.filter((i) => i.reasons.includes("wrong")).map((i) => i.questionId),
    confusedIds: items.filter((i) => i.reasons.includes("confused")).map((i) => i.questionId),
    byGroup: agg((m) => [topOf(m.unit_id) ?? "__none__"], (k) => unitById.get(k)?.title ?? "단원 미지정"),
    byUnit: agg((m) => [m.unit_id ?? "__none__"], (k) => (k === "__none__" ? "단원 미지정" : unitLabel(k))),
    byTopic: agg((m) => (m.topic ? [m.topic] : []), (k) => k),
    byDifficulty: agg((m) => (m.difficulty ? [m.difficulty] : []), (k) => difficultyLabel(k) ?? k),
    byTrap: agg((m) => m.trap_types, (k) => trapLabel(k)),
    bySet: agg((m) => [m.set_id], (k) => setTitle.get(k) ?? "세트"),
    byTag: agg((m) => m.tags, (k) => `#${k}`),
    totalAttempts: graded.length,
    accuracy: graded.length ? graded.filter((s) => s.last_correct).length / graded.length : 0,
    attemptCounts,
  };
}

export async function getSavedIds(subjectId: string, mode: "saved" | "wrong" | "confused"): Promise<string[]> {
  const s = await getWeakSummary(subjectId);
  if (!s) return [];
  if (mode === "wrong") return s.wrongIds;
  if (mode === "confused") return s.confusedIds;
  return s.items.map((i) => i.questionId);
}

/**
 * 약점 섞어 풀기: 약한 단원·세트·태그(정답률 70% 미만)에서 아직 안 푼 문항 60% + 저장된 문제 40%.
 */
export async function buildWeakMix(subjectId: string, n: number): Promise<string[]> {
  const p = await loadProgress(subjectId);
  if (!p) return [];
  const seed = Date.now() & 0xffff;
  const stat = new Map<string, { t: number; c: number }>();
  for (const s of p.stats.values()) {
    if (s.attempt_count === 0) continue;
    const m = p.meta.get(s.question_id);
    if (!m) continue;
    for (const k of [`u:${m.unit_id}`, `s:${m.set_id}`, ...m.tags.map((t) => `t:${t}`)]) {
      const x = stat.get(k) ?? { t: 0, c: 0 };
      x.t++;
      if (s.last_correct) x.c++;
      stat.set(k, x);
    }
  }
  const weakKeys = new Set([...stat].filter(([, x]) => x.c / x.t < 0.7).map(([k]) => k));
  const seen = new Set([...p.stats.values()].filter((s) => s.attempt_count > 0).map((s) => s.question_id));
  const unseenAny = [...p.meta.values()].filter((m) => !seen.has(m.id)).map((m) => m.id);
  const unseenWeak = [...p.meta.values()]
    .filter((m) => !seen.has(m.id))
    .filter((m) => weakKeys.has(`u:${m.unit_id}`) || weakKeys.has(`s:${m.set_id}`) || m.tags.some((t) => weakKeys.has(`t:${t}`)))
    .map((m) => m.id);
  const past = buildSavedItems(p.stats).map((i) => i.questionId);

  const wantNew = Math.round(n * 0.6);
  const pickNew = shuffled(unseenWeak.length ? unseenWeak : unseenAny, seed).slice(0, wantNew);
  const pickPast = shuffled(past, seed + 1).slice(0, n - wantNew);
  let out = [...pickNew, ...pickPast];
  if (out.length < n) {
    const used = new Set(out);
    out = [...out, ...shuffled([...unseenAny, ...past, ...p.meta.keys()].filter((id) => !used.has(id)), seed + 2).slice(0, n - out.length)];
  }
  return shuffled([...new Set(out)], seed + 3);
}
