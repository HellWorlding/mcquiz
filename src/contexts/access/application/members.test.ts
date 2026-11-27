import { describe, expect, it } from "vitest";
import { grantMember, listMembers, revokeMember } from "./members";
import type { AccessDeps, Member, MembershipRepo, ProfileRepo } from "./ports";
import type { CurrentUser } from "../domain/user";

const admin: CurrentUser = { id: "a", email: "a@x", displayName: null, isAdmin: true, aiLimit: null };
const user: CurrentUser = { id: "u", email: "u@x", displayName: null, isAdmin: false, aiLimit: null };

function fakeDeps(current: CurrentUser | null) {
  const members = new Map<string, Set<string>>();
  const profiles: ProfileRepo = {
    byId: async () => null,
    findByEmail: async (e) => (e === "b@x" ? { id: "b", email: "b@x" } : null),
  };
  const repo: MembershipRepo = {
    list: async (s) => [...(members.get(s) ?? [])].map((id): Member => ({ userId: id, email: null, displayName: null, since: "" })),
    isMember: async (s, u) => members.get(s)?.has(u) ?? false,
    grant: async (s, u) => void (members.get(s) ?? members.set(s, new Set()).get(s))!.add(u),
    revoke: async (s, u) => void members.get(s)?.delete(u),
  };
  const deps: AccessDeps = { user: current, profiles, members: repo };
  return { deps, members };
}

describe("members use cases", () => {
  it("관리자가 아니면 거부", async () => {
    const { deps } = fakeDeps(user);
    expect((await listMembers(deps, "s")).ok).toBe(false);
    expect((await grantMember(deps, "s", "b@x")).ok).toBe(false);
  });
  it("A3 이메일로 부여, 중복 부여는 그대로 성공, 회수", async () => {
    const { deps, members } = fakeDeps(admin);
    expect(await grantMember(deps, "s", " B@X ")).toEqual({ ok: true, data: { userId: "b" } });
    expect(await grantMember(deps, "s", "b@x")).toEqual({ ok: true, data: { userId: "b" } });
    expect(members.get("s")?.size).toBe(1);
    expect((await grantMember(deps, "s", "nobody@x")).ok).toBe(false);
    await revokeMember(deps, "s", "b");
    expect(members.get("s")?.size).toBe(0);
  });
});
