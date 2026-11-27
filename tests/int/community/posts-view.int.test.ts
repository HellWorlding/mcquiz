import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/db/database.types";
import { serviceDb, userDb } from "../helpers";

describe("community.posts_view 작성자 이름 (I1·N1)", () => {
  const ids: string[] = [];
  afterAll(async () => { if (ids.length) await serviceDb().schema("community").from("posts").delete().in("id", ids); });

  it("비관리자가 남의 글 작성자 이름을 보고, anon 은 뷰를 읽을 수 없다", async () => {
    const writer = await userDb("int-member@example.com");
    const reader = await userDb("int-other@example.com");
    await serviceDb().schema("access").from("profiles").update({ display_name: "글쓴이" }).eq("id", writer.id);
    const { data: post, error } = await writer.db.schema("community").from("posts").insert({ user_id: writer.id, kind: "idea", title: "t", body: "b" }).select("id").single();
    if (error) throw error;
    ids.push(post!.id);
    const { data: row } = await reader.db.schema("community").from("posts_view").select("author").eq("id", post!.id).single();
    expect(row?.author).toBe("글쓴이");
    const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error: anonErr } = await anon.schema("community").from("posts_view").select("id").limit(1);
    expect(anonErr).not.toBeNull();
  });
});
