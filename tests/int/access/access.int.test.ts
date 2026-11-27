import { afterAll, describe, expect, it } from "vitest";
import { serviceDb, tempSubject, userDb } from "../helpers";

describe("access RLS", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterAll(async () => { for (const c of cleanups) await c(); });

  it("A2 restricted 과목은 멤버만, public 은 로그인 사용자 모두", async () => {
    const r = await tempSubject("restricted"); cleanups.push(r.cleanup);
    const p = await tempSubject("public"); cleanups.push(p.cleanup);
    const member = await userDb("int-member@example.com");
    const other = await userDb("int-other@example.com");
    await serviceDb().schema("access").from("subject_members").upsert({ subject_id: r.id, user_id: member.id });

    const visible = async (db: typeof member.db) => (await db.schema("catalog").from("subjects").select("id").in("id", [r.id, p.id])).data?.map((s) => s.id).sort();
    expect(await visible(member.db)).toEqual([r.id, p.id].sort());
    expect(await visible(other.db)).toEqual([p.id]);
  });

  it("A1 사용자는 자기 is_admin 을 바꿀 수 없다", async () => {
    const u = await userDb("int-other@example.com");
    const { error } = await u.db.schema("access").from("profiles").update({ is_admin: true }).eq("id", u.id);
    expect(error?.message ?? "").toMatch(/is_admin/);
    const { data } = await serviceDb().schema("access").from("profiles").select("is_admin").eq("id", u.id).single();
    expect(data?.is_admin).toBe(false);
  });

  it("A3 같은 멤버 중복 부여는 거부된다 (PK)", async () => {
    const r = await tempSubject("restricted"); cleanups.push(r.cleanup);
    const member = await userDb("int-member@example.com");
    const admin = serviceDb();
    await admin.schema("access").from("subject_members").insert({ subject_id: r.id, user_id: member.id });
    const { error } = await admin.schema("access").from("subject_members").insert({ subject_id: r.id, user_id: member.id });
    expect(error).not.toBeNull();
  });
});
