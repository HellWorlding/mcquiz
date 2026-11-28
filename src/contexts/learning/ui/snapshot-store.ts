/**
 * 풀이 스냅샷의 탭 저장소(sessionStorage) 읽기·쓰기 (D-021). 계산은 domain/snapshot 의 순수 함수.
 * 저장소가 막혀 있거나 꽉 차도 던지지 않는다 — 복구만 못 할 뿐 풀이는 계속된다.
 */
import { keysToPrune, parseSnapshot, savedAtOf, SNAPSHOT_MAX, SNAPSHOT_PREFIX, type QuizSnapshot } from "../domain/snapshot";

/** sessionStorage 와 같은 모양 (테스트는 Map 으로 흉내 낸다) */
export type SnapshotStore = {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

/** 브라우저 탭 저장소 (서버이거나 막혀 있으면 null) */
export function tabStore(): SnapshotStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function ourEntries(store: SnapshotStore): { key: string; savedAt: number }[] {
  const out: { key: string; savedAt: number }[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && key.startsWith(SNAPSHOT_PREFIX)) out.push({ key, savedAt: savedAtOf(store.getItem(key)) });
  }
  return out;
}

/** 스냅샷 쓰기 + 우리 키만 최대 개수로 정리 */
export function writeSnapshot(store: SnapshotStore, key: string, snap: QuizSnapshot, max = SNAPSHOT_MAX): void {
  try {
    store.setItem(key, JSON.stringify(snap));
    for (const k of keysToPrune(ourEntries(store), max)) if (k !== key) store.removeItem(k);
  } catch {
    // 저장 못 하면 복구만 못 한다
  }
}

export function readSnapshot(store: SnapshotStore, key: string, listHash: string, questionCount: number): QuizSnapshot | null {
  try {
    return parseSnapshot(store.getItem(key), listHash, questionCount);
  } catch {
    return null;
  }
}

export function removeSnapshot(store: SnapshotStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // 무시
  }
}
