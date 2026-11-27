import { shuffled } from "./shuffle";

/**
 * L5. 약점 섞어 풀기 표본: 저장함 목록(약점)에서 n개를 seed 로 결정적으로 뽑는다.
 * 모자라면 그대로 돌려준다 — 안 푼 문항으로 채우지 않는다.
 */
export function pickWeakMix(savedBoxIds: readonly string[], n: number, seed: number): string[] {
  const unique = [...new Set(savedBoxIds)];
  const want = Math.max(0, Math.floor(n));
  return shuffled(unique, seed).slice(0, want);
}
