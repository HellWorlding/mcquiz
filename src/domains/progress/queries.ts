import "server-only";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import { shuffled } from "@/domains/quiz/shuffle";
import type { Attempt } from "@/domains/shared/types";

type QMeta = { id: string; unit_id: string | null; set_id: string; tags: string[] };

export type GroupStat = { key: string; label: string; total: number; correct: number; accuracy: number };

export type WeakSummary = {
  /** 한 번이라도 틀린 문항 (많이 틀린 순) */
  wrongIds: string[];
  /** 문항별 틀린 횟수 */
  wrongCounts: Record<string, number>;
  /** 문항별 마지막 결과 (true 정답 / false 오답) */
  lastResult: Record<string, boolean>;
  confusedIds: string[];
  byUnit: GroupStat[];
  bySet: GroupStat[];
  byTag: GroupStat[];
  totalAttempts: number;
  accuracy: number;
};

/** 주제 안의 내 풀이 기록 + 문항 메타 */
async function loadProgress(subjectId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await createClient();
  const [{ data: qs }, { data: units }, { data: sets }] = await Promise.all([
    db.from("questions").select("id, unit_id, set_id, tags").eq("subject_id", subjectId),
    db.from("units").select("id, title, no").eq("subject_id", subjectId),
    db.from("question_sets").select("id, title").eq("subject_id", subjectId),
  ]);
  const meta = new Map<string, QMeta>((qs ?? []).map((q) => [q.id, q]));
  if (meta.size === 0) return { user, db, meta, attempts: [] as Attempt[], units: units ?? [], sets: sets ?? [] };
  const ids = [...meta.keys()];
  const attempts: Attempt[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db
      .from("attempts")
      .select("*")
      .eq("user_id", user.id)
      .in("question_id", ids.slice(i, i + 500))
      .order("created_at");
    attempts.push(...(data ?? []));
  }
  return { user, db, meta, attempts, units: units ?? [], sets: sets ?? [] };
}

function latestByQuestion(attempts: Attempt[]) {
  const latest = new Map<string, Attempt>();
  const everConfused = new Set<string>();
  for (const a of attempts) {
    if (a.selected_ord !== null) latest.set(a.question_id, a); // 정렬이 created_at 오름차순이므로 마지막이 최신
    if (a.confused) everConfused.add(a.question_id);
  }
  return { latest, everConfused };
}

export async function getWeakSummary(subjectId: string): Promise<WeakSummary | null> {
  const p = await loadProgress(subjectId);
  if (!p) return null;
  const { latest, everConfused } = latestByQuestion(p.attempts);
  const wrongCounts: Record<string, number> = {};
  for (const a of p.attempts) if (a.is_correct === false) wrongCounts[a.question_id] = (wrongCounts[a.question_id] ?? 0) + 1;
  const wrongIds = Object.keys(wrongCounts).sort((a, b) => wrongCounts[b] - wrongCounts[a]);
  const lastResult: Record<string, boolean> = {};
  for (const [qid, a] of latest) if (a.is_correct !== null) lastResult[qid] = a.is_correct;
  const confusedIds = [...everConfused];

  const unitTitle = new Map(p.units.map((u) => [u.id, u.no ? `${u.no}. ${u.title}` : u.title]));
  const setTitle = new Map(p.sets.map((s) => [s.id, s.title]));
  const agg = (keyOf: (m: QMeta) => string[], labelOf: (k: string) => string): GroupStat[] => {
    const acc = new Map<string, { total: number; correct: number }>();
    for (const a of latest.values()) {
      const m = p.meta.get(a.question_id);
      if (!m) continue;
      for (const k of keyOf(m)) {
        const s = acc.get(k) ?? { total: 0, correct: 0 };
        s.total++;
        if (a.is_correct) s.correct++;
        acc.set(k, s);
      }
    }
    return [...acc.entries()]
      .map(([key, s]) => ({ key, label: labelOf(key), total: s.total, correct: s.correct, accuracy: s.total ? s.correct / s.total : 0 }))
      .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
  };
  const graded = [...latest.values()];
  return {
    wrongIds,
    wrongCounts,
    lastResult,
    confusedIds,
    byUnit: agg((m) => [m.unit_id ?? "__none__"], (k) => unitTitle.get(k) ?? "단원 미지정"),
    bySet: agg((m) => [m.set_id], (k) => setTitle.get(k) ?? "세트"),
    byTag: agg((m) => m.tags, (k) => `#${k}`),
    totalAttempts: graded.length,
    accuracy: graded.length ? graded.filter((a) => a.is_correct).length / graded.length : 0,
  };
}

export async function getWrongOrConfusedIds(subjectId: string, mode: "wrong" | "confused"): Promise<string[]> {
  const s = await getWeakSummary(subjectId);
  if (!s) return [];
  return mode === "wrong" ? s.wrongIds : s.confusedIds;
}

/**
 * 약점 섞어 풀기: 약한 단원·세트·태그(정답률 70% 미만)에서 아직 안 푼 문항 60% + 과거 오답·헷갈림 40%.
 * 모자라는 쪽은 다른 쪽으로 채운다.
 */
export async function buildWeakMix(subjectId: string, n: number): Promise<string[]> {
  const p = await loadProgress(subjectId);
  if (!p) return [];
  const { latest, everConfused } = latestByQuestion(p.attempts);
  const seed = Date.now() & 0xffffffff;

  const weakUnits = new Set<string>();
  const weakSets = new Set<string>();
  const weakTags = new Set<string>();
  const stat = new Map<string, { t: number; c: number }>();
  for (const a of latest.values()) {
    const m = p.meta.get(a.question_id);
    if (!m) continue;
    for (const k of [`u:${m.unit_id}`, `s:${m.set_id}`, ...m.tags.map((t) => `t:${t}`)]) {
      const s = stat.get(k) ?? { t: 0, c: 0 };
      s.t++;
      if (a.is_correct) s.c++;
      stat.set(k, s);
    }
  }
  for (const [k, s] of stat) {
    if (s.c / s.t < 0.7) {
      if (k.startsWith("u:")) weakUnits.add(k.slice(2));
      else if (k.startsWith("s:")) weakSets.add(k.slice(2));
      else weakTags.add(k.slice(2));
    }
  }
  const unseenWeak = [...p.meta.values()]
    .filter((m) => !latest.has(m.id))
    .filter((m) => weakUnits.has(String(m.unit_id)) || weakSets.has(m.set_id) || m.tags.some((t) => weakTags.has(t)))
    .map((m) => m.id);
  const unseenAny = [...p.meta.values()].filter((m) => !latest.has(m.id)).map((m) => m.id);
  const past = [...new Set([...[...latest.values()].filter((a) => a.is_correct === false).map((a) => a.question_id), ...everConfused])];

  const wantNew = Math.round(n * 0.6);
  const wantPast = n - wantNew;
  const pickNew = shuffled(unseenWeak.length ? unseenWeak : unseenAny, seed).slice(0, wantNew);
  const pickPast = shuffled(past, seed + 1).slice(0, wantPast);
  let out = [...pickNew, ...pickPast];
  if (out.length < n) {
    const used = new Set(out);
    const filler = shuffled([...unseenAny, ...past, ...p.meta.keys()].filter((id) => !used.has(id)), seed + 2);
    out = [...out, ...filler.slice(0, n - out.length)];
  }
  return shuffled([...new Set(out)], seed + 3);
}
