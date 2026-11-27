/** application 테스트용 인메모리 가짜 포트 */
import type { CurrentUser } from "@/contexts/access";
import type { Post } from "../domain/post";
import type { QuestionReport } from "../domain/report";
import type { CommunityDeps, PostRepo, ReportRepo } from "./ports";

export const admin: CurrentUser = { id: "a", email: "a@x", displayName: null, isAdmin: true, aiLimit: null };
export const user: CurrentUser = { id: "u", email: "u@x", displayName: null, isAdmin: false, aiLimit: null };
export const other: CurrentUser = { id: "o", email: "o@x", displayName: null, isAdmin: false, aiLimit: null };

export function fakeDeps(current: CurrentUser | null, opts: { questionIds?: string[]; now?: Date } = {}) {
  const now = opts.now ?? new Date("2026-11-29T12:00:00Z");
  const posts: Post[] = [];
  const reports: QuestionReport[] = [];
  const questions = new Map((opts.questionIds ?? ["q1"]).map((id) => [id, { id, prompt: `P-${id}`, setId: `set-${id}` }]));
  let seq = 0;

  const postRepo: PostRepo = {
    list: async (page, size) => {
      const sorted = [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { posts: sorted.slice((page - 1) * size, page * size), total: posts.length };
    },
    byId: async (id) => posts.find((p) => p.id === id) ?? null,
    countSince: async (userId, since) => posts.filter((p) => p.userId === userId && new Date(p.createdAt) >= since).length,
    insert: async (userId, p) => {
      const at = new Date(now.getTime() + seq++).toISOString();
      posts.push({ id: `p${seq}`, userId, ...p, status: "open", adminReply: null, createdAt: at, updatedAt: at, author: userId });
    },
    delete: async (id) => {
      const i = posts.findIndex((p) => p.id === id);
      if (i >= 0) posts.splice(i, 1);
    },
    update: async (id, patch, at) => {
      const p = posts.find((x) => x.id === id);
      if (!p) return;
      if (patch.status !== undefined) p.status = patch.status;
      if (patch.adminReply !== undefined) p.adminReply = patch.adminReply;
      p.updatedAt = at.toISOString();
    },
  };
  const reportRepo: ReportRepo = {
    list: async (status) => reports.filter((r) => !status || r.status === status),
    countSince: async (userId, since) => reports.filter((r) => r.userId === userId && new Date(r.createdAt) >= since).length,
    insert: async (userId, r) => {
      reports.push({ id: `r${++seq}`, userId, ...r, status: "open", createdAt: now.toISOString() });
    },
    setStatus: async (id, status) => {
      const r = reports.find((x) => x.id === id);
      if (r) r.status = status;
    },
  };
  const deps: CommunityDeps = {
    user: current,
    posts: postRepo,
    reports: reportRepo,
    questions: {
      exists: async (id) => questions.has(id),
      summaries: async (ids) => ids.flatMap((id) => (questions.has(id) ? [questions.get(id)!] : [])),
    },
    now: () => now,
  };
  return { deps, posts, reports };
}
