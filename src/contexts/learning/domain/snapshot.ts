/**
 * 풀이 화면 스냅샷 (순수). 뒤로가기·새로고침으로 화면이 다시 조립돼도 그 자리에서 이어 풀게
 * 탭 저장소(sessionStorage)에 진행 상태를 적어 둔다 (D-021). 저장소는 밖에서 받는다.
 *
 * 키 = "mcquiz.quiz." + (세션이 있으면 "s-<세션id>", 없으면 "k-<퀴즈키>") + "." + 문항 id 목록 해시.
 * 목록이 다르면 키가 달라 복구하지 않는다. 세션이 생기면 퀴즈키 쪽 스냅샷은 지운다
 * (그래야 같은 주소로 새 퀴즈를 시작했을 때 옛 상태가 끼어들지 않는다).
 */
import { hashString } from "./shuffle";

export const SNAPSHOT_PREFIX = "mcquiz.quiz.";
export const SNAPSHOT_MAX = 5;
const VERSION = 1;

export type SnapshotAnswer = { selectedOrd: number | null; isCorrect: boolean | null; confused: boolean; attemptId: string | null };

export type QuizSnapshot = {
  v: typeof VERSION;
  savedAt: number;
  listHash: string;
  sessionId: string | null;
  idx: number;
  answers: Record<string, SnapshotAnswer>;
  elapsed: Record<string, number>;
  dismissed: string[];
  finished: boolean;
  /** 선지 셔플 seed (복원할 때 같은 선지 순서) */
  salt: number;
};

/** sessionStorage 와 같은 모양 (테스트는 Map 으로 흉내 낸다) */
export type SnapshotStore = {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

/** 문항 id 목록 해시 (순서까지 같아야 같다) */
export function listHashOf(ids: readonly string[]): string {
  return `${ids.length}-${hashString(ids.join(",")).toString(36)}`;
}

/** 스냅샷 키. 세션이 있으면 세션 기준 (주소가 ?subject= → ?session= 으로 바뀌어도 같은 키) */
export function snapshotKey(base: { sessionId: string | null; quizKey: string }, ids: readonly string[]): string {
  const head = base.sessionId ? `s-${base.sessionId}` : `k-${base.quizKey}`;
  return `${SNAPSHOT_PREFIX}${head}.${listHashOf(ids)}`;
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** 저장된 글 → 스냅샷. 모양이 틀리거나 목록 해시가 다르면 null */
export function parseSnapshot(raw: string | null, listHash: string, questionCount: number): QuizSnapshot | null {
  if (!raw) return null;
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(x) || x.v !== VERSION || x.listHash !== listHash) return null;
  if (!isNum(x.idx) || !isNum(x.salt) || !isNum(x.savedAt) || typeof x.finished !== "boolean") return null;
  if (!isObj(x.answers) || !isObj(x.elapsed) || !Array.isArray(x.dismissed)) return null;
  if (x.sessionId !== null && typeof x.sessionId !== "string") return null;
  const answers: Record<string, SnapshotAnswer> = {};
  for (const [qid, a] of Object.entries(x.answers)) {
    if (!isObj(a)) continue;
    answers[qid] = {
      selectedOrd: isNum(a.selectedOrd) ? a.selectedOrd : null,
      isCorrect: typeof a.isCorrect === "boolean" ? a.isCorrect : null,
      confused: a.confused === true,
      attemptId: typeof a.attemptId === "string" ? a.attemptId : null,
    };
  }
  const elapsed: Record<string, number> = {};
  for (const [qid, s] of Object.entries(x.elapsed)) if (isNum(s) && s >= 0) elapsed[qid] = s;
  const idx = Math.min(Math.max(0, Math.floor(x.idx)), Math.max(0, questionCount - 1));
  return {
    v: VERSION,
    savedAt: x.savedAt,
    listHash,
    sessionId: x.sessionId,
    idx,
    answers,
    elapsed,
    dismissed: x.dismissed.filter((d): d is string => typeof d === "string"),
    finished: x.finished,
    salt: x.salt,
  };
}

/** 오래된 것부터 지울 키 (최대 max 개만 남긴다). entries 는 우리 접두어 키만 */
export function keysToPrune(entries: { key: string; savedAt: number }[], max = SNAPSHOT_MAX): string[] {
  if (entries.length <= max) return [];
  return [...entries]
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(0, entries.length - max)
    .map((e) => e.key);
}

/** 저장소의 우리 스냅샷 목록 (읽지 못하는 것은 savedAt 0 → 가장 먼저 지운다) */
function ourEntries(store: SnapshotStore): { key: string; savedAt: number }[] {
  const out: { key: string; savedAt: number }[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !key.startsWith(SNAPSHOT_PREFIX)) continue;
    let savedAt = 0;
    try {
      const v = JSON.parse(store.getItem(key) ?? "null") as { savedAt?: unknown } | null;
      if (v && isNum(v.savedAt)) savedAt = v.savedAt;
    } catch {
      // 깨진 값은 가장 오래된 것으로
    }
    out.push({ key, savedAt });
  }
  return out;
}

/** 스냅샷 쓰기 + 개수 정리. 저장소가 꽉 차거나 막혀 있어도 던지지 않는다 */
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
