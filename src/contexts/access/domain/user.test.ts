import { describe, expect, it } from "vitest";
import { canReadSubject, type CurrentUser } from "./user";

const admin: CurrentUser = { id: "a", email: "a@x", displayName: null, isAdmin: true, aiLimit: null };
const user: CurrentUser = { id: "u", email: "u@x", displayName: null, isAdmin: false, aiLimit: null };

describe("A2 canReadSubject", () => {
  it("관리자는 모든 과목", () => {
    expect(canReadSubject(admin, { visibility: "restricted" }, false)).toBe(true);
  });
  it("로그인 사용자는 public 과목", () => {
    expect(canReadSubject(user, { visibility: "public" }, false)).toBe(true);
  });
  it("restricted 는 멤버만", () => {
    expect(canReadSubject(user, { visibility: "restricted" }, false)).toBe(false);
    expect(canReadSubject(user, { visibility: "restricted" }, true)).toBe(true);
  });
  it("게스트는 guestAccess 가 켜졌을 때 public 만", () => {
    expect(canReadSubject(null, { visibility: "public" }, false)).toBe(false);
    expect(canReadSubject(null, { visibility: "public" }, false, true)).toBe(true);
    expect(canReadSubject(null, { visibility: "restricted" }, true, true)).toBe(false);
  });
});
