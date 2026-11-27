import type { Db, Row } from "@/shared/db/types";
import { toPostKind, toPostStatus, type Post } from "../../domain/post";
import type { PostRepo } from "../../application/ports";

type ViewRow = Row<"community", "posts"> & { author: string | null };

function toPost(r: ViewRow): Post {
  return {
    id: r.id,
    userId: r.user_id,
    kind: toPostKind(r.kind),
    title: r.title,
    body: r.body,
    status: toPostStatus(r.status),
    adminReply: r.admin_reply,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    author: r.author ?? "",
  };
}

export function postRepo(db: Db): PostRepo {
  const posts = () => db.schema("community").from("posts");
  const view = () => db.schema("community").from("posts_view");
  return {
    async list(page, pageSize) {
      const from = (page - 1) * pageSize;
      const { data, count, error } = await view()
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      return { posts: (data ?? []).map((r) => toPost(r as ViewRow)), total: count ?? 0 };
    },
    async byId(id) {
      const { data, error } = await view().select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toPost(data as ViewRow) : null;
    },
    async countSince(userId, since) {
      const { count, error } = await posts().select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async insert(userId, post) {
      const { error } = await posts().insert({ user_id: userId, kind: post.kind, title: post.title, body: post.body });
      if (error) throw new Error(error.message);
    },
    async delete(id) {
      const { error } = await posts().delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async update(id, patch, updatedAt) {
      const row: { status?: string; admin_reply?: string | null; updated_at: string } = { updated_at: updatedAt.toISOString() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.adminReply !== undefined) row.admin_reply = patch.adminReply;
      const { error } = await posts().update(row).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
