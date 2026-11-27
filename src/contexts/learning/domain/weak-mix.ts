import { shuffled } from "./shuffle";

type StatLike = { questionId: string; unitId: string | null; setId: string | null; tags: string[]; attemptCount: number; lastCorrect: boolean | null };
type UnsolvedLike = { id: string; unitId: string | null; setId: string | null; tags: string[] };

export type WeakMixInput = {
  /** 과목의 문항 통계 (푼 것만 있어도 됨) */
  stats: readonly StatLike[];
  /** 아직 안 푼 문항 */
  unsolved: readonly UnsolvedLike[];
  /** 저장함(약점) 문항 id */
  savedBoxIds: readonly string[];
};

/** 정답률 70% 미만인 단원·세트·태그 키 ("u:<unit>", "s:<set>", "t:<tag>") */
export function weakKeys(stats: readonly StatLike[]): Set<string> {
  const agg = new Map<string, { t: number; c: number }>();
  for (const s of stats) {
    if (s.attemptCount === 0) continue;
    for (const k of [`u:${s.unitId}`, `s:${s.setId}`, ...s.tags.map((t) => `t:${t}`)]) {
      const x = agg.get(k) ?? { t: 0, c: 0 };
      x.t++;
      if (s.lastCorrect) x.c++;
      agg.set(k, x);
    }
  }
  return new Set([...agg].filter(([, x]) => x.c / x.t < 0.7).map(([k]) => k));
}

/**
 * L5. 약점 섞어 풀기 (D-007: 옛 동작). n 의 60% 는 "약한 영역의 안 푼 문항"(없으면 아무 안 푼 문항), 40% 는 저장함.
 * 모자라면 안 푼 문항·저장함 나머지로 채우고, 전체를 seed 로 섞는다. 결정적이다.
 */
export function pickWeakMix(input: WeakMixInput, n: number, seed: number): string[] {
  const want = Math.max(0, Math.floor(n));
  const keys = weakKeys(input.stats);
  const unsolvedAny = input.unsolved.map((u) => u.id);
  const unsolvedWeak = input.unsolved.filter((u) => keys.has(`u:${u.unitId}`) || keys.has(`s:${u.setId}`) || u.tags.some((t) => keys.has(`t:${t}`))).map((u) => u.id);
  const past = [...new Set(input.savedBoxIds)];
  const wantNew = Math.round(want * 0.6);
  const pickNew = shuffled(unsolvedWeak.length ? unsolvedWeak : unsolvedAny, seed).slice(0, wantNew);
  const pickPast = shuffled(past, seed + 1).slice(0, want - wantNew);
  let out = [...pickNew, ...pickPast];
  if (out.length < want) {
    const used = new Set(out);
    out = [...out, ...shuffled([...unsolvedAny, ...past].filter((id) => !used.has(id)), seed + 2).slice(0, want - out.length)];
  }
  return shuffled([...new Set(out)], seed + 3).slice(0, want);
}
