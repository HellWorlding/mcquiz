import "server-only";
import { createClient } from "@/domains/auth/supabase/server";

export const PAGE_SIZE = 10;

export type BoardPost = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
  author: string;
};

export async function listPosts(page: number): Promise<{ posts: BoardPost[]; total: number; page: number; pages: number }> {
  const db = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await db
    .from("board_posts_view")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const total = count ?? 0;
  return {
    posts: (data ?? []) as BoardPost[],
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
