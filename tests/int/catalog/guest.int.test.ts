import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/db/database.types";
import { serviceDb, tempSubject } from "../helpers";

const anon = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

describe("게스트(anon) 읽기 정책 (D-009 / A2)", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterAll(async () => { for (const c of cleanups) await c(); });

  it("공개 과목의 문항·선지는 보이고 제한 과목은 0행, 쓰기는 거부", async () => {
    const pub = await tempSubject("public"); cleanups.push(pub.cleanup);
    const res = await tempSubject("restricted"); cleanups.push(res.cleanup);
    const admin = serviceDb();
    for (const sid of [pub.id, res.id]) {
      const { data: set } = await admin.schema("catalog").from("question_sets").insert({ subject_id: sid, title: "t" }).select("id").single();
      const { data: q, error: qErr } = await admin.schema("catalog").from("questions").insert({ subject_id: sid, set_id: set!.id, ord: 1, prompt: `p-${sid}`, choice_count: 4, correct_choice: 1 }).select("id").single();
      if (qErr) throw qErr;
      await admin.schema("catalog").from("choices").insert([1, 2, 3, 4].map((o) => ({ question_id: q!.id, ord: o, text: `c${o}` })));
    }
    const a = anon();
    const subjects = (await a.schema("catalog").from("subjects").select("id").in("id", [pub.id, res.id])).data?.map((s) => s.id);
    expect(subjects).toEqual([pub.id]);
    const { data: pubQ } = await a.schema("catalog").from("questions").select("id, choices(ord)").eq("subject_id", pub.id);
    expect(pubQ).toHaveLength(1);
    expect(pubQ?.[0].choices).toHaveLength(4);
    const { data: resQ } = await a.schema("catalog").from("questions").select("id").eq("subject_id", res.id);
    expect(resQ).toEqual([]);
    const { error } = await a.schema("catalog").from("question_sets").insert({ subject_id: pub.id, title: "x" });
    expect(error).not.toBeNull();
    // 다른 컨텍스트 스키마는 anon 에게 select 권한 자체가 없다 (I7)
    const { data: chunks, error: chunkErr } = await a.schema("knowledge").from("chunks").select("id").limit(1);
    expect(chunks).toBeNull();
    expect(chunkErr).not.toBeNull();
    // 단원·세트도 공개 과목만
    await admin.schema("catalog").from("units").insert([{ subject_id: pub.id, no: 1, title: "u", sort: 1 }, { subject_id: res.id, no: 1, title: "u", sort: 1 }]);
    const units = (await a.schema("catalog").from("units").select("subject_id").in("subject_id", [pub.id, res.id])).data?.map((u) => u.subject_id);
    expect(units).toEqual([pub.id]);
    const sets = (await a.schema("catalog").from("question_sets").select("subject_id").in("subject_id", [pub.id, res.id])).data?.map((u) => u.subject_id);
    expect(sets).toEqual([pub.id]);
  });

  it("anon 은 보안 함수를 실행할 수 없고 읽기 전용 함수만 쓴다 (I7)", async () => {
    const a = anon();
    const denied = await a.schema("access").rpc("readable_subject_ids");
    expect(denied.error?.message ?? "").toMatch(/permission|denied/i);
    const stats = await a.schema("learning").rpc("question_stats", { p_subject: "00000000-0000-0000-0000-000000000000" });
    expect(stats.error).not.toBeNull();
    const ok = await a.schema("catalog").rpc("unit_subtree", { root_ids: [] });
    expect(ok.error).toBeNull();
  });
});
