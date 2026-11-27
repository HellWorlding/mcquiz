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
    const { data: chunks } = await a.schema("knowledge").from("chunks").select("id").limit(1);
    expect(chunks).toEqual([]);
  });
});
