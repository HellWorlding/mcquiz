import type { Result } from "@/shared/result";
import type { ReportStatus } from "../domain/report";
import type { CommunityDeps, PostPage } from "./ports";
import { createPost, deletePost, listPosts, updatePost } from "./posts";
import { listReports, reportQuestion, resolveReport, type ReportRow } from "./reports";

/** PRD-04 §4 community 공개 API 객체 */
export type CommunityApi = {
  listPosts(page: number): Promise<Result<PostPage>>;
  createPost(input: { kind: string; title: string; body: string }): Promise<Result<void>>;
  deletePost(id: string): Promise<Result<void>>;
  /** admin */
  updatePost(id: string, patch: { status?: string; reply?: string | null }): Promise<Result<void>>;
  reportQuestion(input: { questionId: string; kind: string; message: string }): Promise<Result<void>>;
  /** admin */
  resolveReport(id: string, status: ReportStatus): Promise<Result<void>>;
  /** admin */
  listReports(status?: ReportStatus): Promise<Result<ReportRow[]>>;
};

export function communityApi(deps: CommunityDeps): CommunityApi {
  return {
    listPosts: (page) => listPosts(deps, page),
    createPost: (input) => createPost(deps, input),
    deletePost: (id) => deletePost(deps, id),
    updatePost: (id, patch) => updatePost(deps, id, patch),
    reportQuestion: (input) => reportQuestion(deps, input),
    resolveReport: (id, status) => resolveReport(deps, id, status),
    listReports: (status) => listReports(deps, status),
  };
}
