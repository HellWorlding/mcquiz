import { describe, expect, it } from "vitest";
import { listHashOf, SNAPSHOT_PREFIX, type QuizSnapshot } from "../domain/snapshot";
import { readSnapshot, removeSnapshot, writeSnapshot, type SnapshotStore } from "./snapshot-store";

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
  answers: { q1: { selectedOrd: 1, isCorrect: true, confused: false, attemptId: "a1" } },
  elapsed: { q1: 12 },
  dismissed: [],
  finished: false,
  salt: 4242,
  struck: ["q2:1"],
  ...over,
});

describe("D-021 스냅샷 탭 저장소", () => {
  it("쓰고 읽으면 같은 값 (struck 포함)", () => {
    const s = memStore();
    writeSnapshot(s, `${SNAPSHOT_PREFIX}a`, snap());
    expect(readSnapshot(s, `${SNAPSHOT_PREFIX}a`, listHashOf(ids), ids.length)).toEqual(snap());
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
