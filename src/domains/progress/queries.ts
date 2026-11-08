import "server-only";
import { createClient } from "@/domains/auth/supabase/server";
import { getCurrentUser } from "@/domains/auth/session";
import { shuffled } from "@/domains/quiz/shuffle";
import type { Attempt } from "@/domains/shared/types";

type QMeta = { id: string; unit_id: string | null; set_id: string; tags: string[] };
type Mark = { question_id: string; kind: string; at: string };

export type GroupStat = { key: string; label: string; total: number; correct: number; accuracy: number };

/** 저장된 문제 목록의 한 항목 */
export type SavedItem = {
  questionId: string;
  wrongCount: number;
  /** 마지막 채점 결과 */
  lastResult: boolean | null;
  confused: boolean;
  /** 직접 저장 */
  saved: boolean;
  /** 목록에 들어온 이유 */
  reasons: ("wrong" | "confused" | "saved")[];
  /** 정렬용: 가장 최근 활동 시각 */
  lastAt: string;
};

export type WeakSummary = {
  /** 저장된 문제 (틀림·헷갈림 자동 + 직접 저장, '빼기' 한 것은 제외) */
  items: SavedItem[];
  wrongIds: string[];
  confusedIds: string[];
  byUnit: GroupStat[];
  bySet: GroupStat[];
  byTag: GroupStat[];
  totalAttempts: number;
  accuracy: number;
};

/** 주제 안의 내 풀이 기록 + 표시 + 문항 메타 */
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
  const attempts: Attempt[] = [];
  const marks: Mark[] = [];
  const ids = [...meta.keys()];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const [{ data: a }, { data: m }] = await Promise.all([
      db.from("attempts").select("*").eq("user_id", user.id).in("question_id", chunk).order("created_at"),
      db.from("question_marks").select("question_id, kind, at").eq("user_id", user.id).in("question_id", chunk),
    ]);
    attempts.push(...(a ?? []));
    marks.push(...(m ?? []));
  }
  return { user, db, meta, attempts, marks, units: units ?? [], sets: sets ?? [] };
}

function latestByQuestion(attempts: Attempt[]) {
  const latest = new Map<string, Attempt>();
  for (const a of attempts) if (a.selected_ord !== null) latest.set(a.question_id, a); // created_at 오름차순 → 마지막이 최신
  return latest;
}

/** 저장된 문제 목록 계산: 빼기(dismissed) 이후에 새로 틀리거나 헷갈림·저장한 것만 다시 들어온다 */
function buildSavedItems(attempts: Attempt[], marks: Mark[]): SavedItem[] {
  const dismissedAt = new Map<string, string>();
  const savedAt = new Map<string, string>();
  for (const m of marks) {
    if (m.kind === "dismissed") dismissedAt.set(m.question_id, m.at);
    if (m.kind === "saved") savedAt.set(m.question_id, m.at);
  }
  const acc = new Map<string, SavedItem>();
  const get = (qid: string) => {
    let it = acc.get(qid);
    if (!it) {
      it = { questionId: qid, wrongCount: 0, lastResult: null, confused: false, saved: false, reasons: [], lastAt: "" };
      acc.set(qid, it);
    }
    return it;
  };
  const after = (qid: string, at: string) => {
    const d = dismissedAt.get(qid);
    return !d || at > d;
  };
  for (const a of attempts) {
    const it = get(a.question_id);
    if (a.is_correct === false) it.wrongCount++;
    if (a.selected_ord !== null && a.is_correct !== null) it.lastResult = a.is_correct;
    if (after(a.question_id, a.created_at)) {
      if (a.is_correct === false && !it.reasons.includes("wrong")) it.reasons.push("wrong");
      if (a.confused) {
        it.confused = true;
        if (!it.reasons.includes("confused")) it.reasons.push("confused");
      }
      if (a.is_correct === false || a.confused) it.lastAt = a.created_at > it.lastAt ? a.created_at : it.lastAt;
    }
  }
  for (const [qid, at] of savedAt) {
    if (!after(qid, at)) continue;
    const it = get(qid);
    it.saved = true;
    it.reasons.push("saved");
    it.lastAt = at > it.lastAt ? at : it.lastAt;
  }
  return [...acc.values()]
    .filter((it) => it.reasons.length > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount || (b.lastAt > a.lastAt ? 1 : -1));
}

export async function getWeakSummary(subjectId: string): Promise<WeakSummary | null> {
  const p = await loadProgress(subjectId);
  if (!p) return null;
  const latest = latestByQuestion(p.attempts);
  const items = buildSavedItems(p.attempts, p.marks);

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
    items,
    wrongIds: items.filter((i) => i.reasons.includes("wrong")).map((i) => i.questionId),
    confusedIds: items.filter((i) => i.reasons.includes("confused")).map((i) => i.questionId),
    byUnit: agg((m) => [m.unit_id ?? "__none__"], (k) => unitTitle.get(k) ?? "단원 미지정"),
    bySet: agg((m) => [m.set_id], (k) => setTitle.get(k) ?? "세트"),
    byTag: agg((m) => m.tags, (k) => `#${k}`),
    totalAttempts: graded.length,
    accuracy: graded.length ? graded.filter((a) => a.is_correct).length / graded.length : 0,
  };
}

/** 저장된 문제 전체 / 틀림만 / 헷갈림만 */
export async function getSavedIds(subjectId: string, mode: "saved" | "wrong" | "confused"): Promise<string[]> {
  const s = await getWeakSummary(subjectId);
  if (!s) return [];
  if (mode === "wrong") return s.wrongIds;
  if (mode === "confused") return s.confusedIds;
  return s.items.map((i) => i.questionId);
}

/**
 * 약점 섞어 풀기: 약한 단원·세트·태그(정답률 70% 미만)에서 아직 안 푼 문항 60% + 저장된 문제 40%.
 * 모자라는 쪽은 다른 쪽으로 채운다.
 */
export async function buildWeakMix(subjectId: string, n: number): Promise<string[]> {
  const p = await loadProgress(subjectId);
  if (!p) return [];
  const latest = latestByQuestion(p.attempts);
  const seed = Date.now() & 0xffff;

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
  const past = buildSavedItems(p.attempts, p.marks).map((i) => i.questionId);

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
