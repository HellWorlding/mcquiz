import { describe, expect, it } from "vitest";
import { canEditCollection, collectionSubtreeIds, resolveCollectionScope } from "./collection";

const admin = { id: "a", isAdmin: true };
const user = { id: "u", isAdmin: false };

describe("C6 묶음 scope", () => {
  it("shared 는 관리자만, 일반 사용자의 shared 요청은 private 으로", () => {
    expect(resolveCollectionScope("shared", admin)).toBe("shared");
    expect(resolveCollectionScope("shared", user)).toBe("private");
    expect(resolveCollectionScope("private", admin)).toBe("private");
  });
  it("private 묶음은 만든 사람만, shared 는 관리자만 고친다", () => {
    expect(canEditCollection({ scope: "private", createdBy: "u" }, user)).toBe(true);
    expect(canEditCollection({ scope: "private", createdBy: "other" }, user)).toBe(false);
    expect(canEditCollection({ scope: "shared", createdBy: "u" }, user)).toBe(false);
    expect(canEditCollection({ scope: "shared", createdBy: "x" }, admin)).toBe(true);
    expect(canEditCollection({ scope: "private", createdBy: "u" }, null)).toBe(false);
  });
  it("하위 묶음 id 를 모두 모은다", () => {
    const all = [
      { id: "r", parentId: null },
      { id: "c1", parentId: "r" },
      { id: "c11", parentId: "c1" },
      { id: "other", parentId: null },
    ];
    expect(collectionSubtreeIds(all, "r").sort()).toEqual(["c1", "c11", "r"]);
    expect(collectionSubtreeIds(all, "other")).toEqual(["other"]);
  });
});
