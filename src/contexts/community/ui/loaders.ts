import "server-only";
import type { PostPage } from "../application/ports";
import { listPosts as listPostsUc } from "../application/posts";
import { listReports as listReportsUc, type ReportRow } from "../application/reports";
import type { ReportStatus } from "../domain/report";
import { sessionCommunityDeps } from "./deps";

/** /board 페이지: 거부(게스트)면 빈 페이지 (페이지가 requireUser 로 먼저 막는다) */
export async function listPosts(page: number): Promise<PostPage> {
  const r = await listPostsUc(await sessionCommunityDeps(), page);
  return r.ok ? r.data : { posts: [], total: 0, page: Math.max(1, page || 1), pages: 1 };
}

/** /admin/reports 페이지: 관리자가 아니면 빈 목록 (페이지가 requireAdmin 으로 먼저 막는다) */
export async function listReports(status?: ReportStatus): Promise<ReportRow[]> {
  const r = await listReportsUc(await sessionCommunityDeps(), status);
  return r.ok ? r.data : [];
}
