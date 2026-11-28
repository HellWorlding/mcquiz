import { describe, expect, it } from "vitest";
import { keysToPrune, listHashOf, parseSnapshot, readSnapshot, removeSnapshot, snapshotKey, SNAPSHOT_PREFIX, writeSnapshot, type QuizSnapshot, type SnapshotStore } from "./snapshot";

function memStore(): SnapshotStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const ids = ["q1", "q2", "q3"];
const snap = (over: Partial<QuizSnapshot> = {}): QuizSnapshot => ({
  v: 1,
  savedAt: 1000,
  listHash: listHashOf(ids),
  sessionId: null,
  idx: 2,
  answers: { q1: { selectedOrd: 1, isCorrect: true, confused: false, attemptId: "a1" }, q2: { selectedOrd: 3, isCorrect: false, confused: true, attemptId: null } },
  elapsed: { q1: 12, q2: 30, q3: 4 },
  dismissed: ["q2"],
  finished: false,
  salt: 4242,
  ...over,
});

describe("D-021 풀이 스냅샷", () => {
  it("키: 세션이 있으면 세션 기준, 없으면 퀴즈키 기준 + 목록 해시", () => {
    expect(snapshotKey({ sessionId: null, quizKey: "abc" }, ids)).toBe(`${SNAPSHOT_PREFIX}k-abc.${listHashOf(ids)}`);
    expect(snapshotKey({ sessionId: "S1", quizKey: "abc" }, ids)).toBe(`${SNAPSHOT_PREFIX}s-S1.${listHashOf(ids)}`);
  });

  it("목록 해시: 순서·개수가 다르면 다르다", () => {
    expect(listHashOf(ids)).toBe(listHashOf(["q1", "q2", "q3"]));
    expect(listHashOf(ids)).not.toBe(listHashOf(["q2", "q1", "q3"]));
    expect(listHashOf(ids)).not.toBe(listHashOf(["q1", "q2"]));
  });

  it("직렬화 → 복원: 같은 값 (seed·답·시간·빼기·결과 화면)", () => {
    const s = memStore();
    const key = snapshotKey({ sessionId: null, quizKey: "k" }, ids);
    writeSnapshot(s, key, snap({ finished: true }));
    expect(readSnapshot(s, key, listHashOf(ids), ids.length)).toEqual(snap({ finished: true }));
  });

  it("목록 해시가 다르면 복구하지 않는다", () => {
    const raw = JSON.stringify(snap());
    expect(parseSnapshot(raw, listHashOf(["q1", "q2"]), 2)).toBeNull();
  });

  it("깨진 값·다른 버전·모양 틀림은 null", () => {
    const h = listHashOf(ids);
    expect(parseSnapshot(null, h, 3)).toBeNull();
    expect(parseSnapshot("{", h, 3)).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...snap(), v: 2 }), h, 3)).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...snap(), idx: "2" }), h, 3)).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...snap(), answers: [] }), h, 3)).toBeNull();
  });

  it("위치는 문항 수 안으로 자른다", () => {
    expect(parseSnapshot(JSON.stringify(snap({ idx: 99 })), listHashOf(ids), 3)?.idx).toBe(2);
    expect(parseSnapshot(JSON.stringify(snap({ idx: -3 })), listHashOf(ids), 3)?.idx).toBe(0);
  });

  it("오래된 것부터 정리: 최대 5개", () => {
    const entries = [5, 1, 4, 2, 6, 3, 7].map((t) => ({ key: `k${t}`, savedAt: t }));
    expect(keysToPrune(entries, 5)).toEqual(["k1", "k2"]);
    expect(keysToPrune(entries.slice(0, 5), 5)).toEqual([]);
  });

  it("쓰기는 우리 키만 5개로 정리하고 다른 키는 건드리지 않는다", () => {
    const s = memStore();
    s.setItem("other", "x");
    for (let i = 1; i <= 7; i++) writeSnapshot(s, `${SNAPSHOT_PREFIX}t${i}`, snap({ savedAt: i }));
    const ours = [...s.map.keys()].filter((k) => k.startsWith(SNAPSHOT_PREFIX)).sort();
    expect(ours).toEqual([3, 4, 5, 6, 7].map((i) => `${SNAPSHOT_PREFIX}t${i}`));
    expect(s.getItem("other")).toBe("x");
    removeSnapshot(s, `${SNAPSHOT_PREFIX}t7`);
    expect(s.getItem(`${SNAPSHOT_PREFIX}t7`)).toBeNull();
  });

  it("저장소가 막혀 있어도 던지지 않는다", () => {
    const broken: SnapshotStore = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => writeSnapshot(broken, "k", snap())).not.toThrow();
    expect(readSnapshot(broken, "k", listHashOf(ids), 3)).toBeNull();
    expect(() => removeSnapshot(broken, "k")).not.toThrow();
  });
});
