import type { CurrentUser } from "@/contexts/access";
import type { NewPost, Post, PostPatch } from "../domain/post";
import type { NewReport, QuestionReport, ReportStatus } from "../domain/report";

export type PostPage = { posts: Post[]; total: number; page: number; pages: number };

export type PostRepo = {
  /** 최신순 한 페이지 (posts_view, author 포함) */
  list(page: number, pageSize: number): Promise<{ posts: Post[]; total: number }>;
  byId(id: string): Promise<Post | null>;
  /** 그 사용자가 since 이후에 쓴 글 수 (하루 제한용) */
  countSince(userId: string, since: Date): Promise<number>;
  insert(userId: string, post: NewPost): Promise<void>;
  delete(id: string): Promise<void>;
  update(id: string, patch: PostPatch, updatedAt: Date): Promise<void>;
};

export type ReportRepo = {
  /** status 를 주면 그 상태만. 상태(open 먼저)·최신순, 최대 200건 */
  list(status?: ReportStatus): Promise<QuestionReport[]>;
  countSince(userId: string, since: Date): Promise<number>;
  insert(userId: string, report: NewReport): Promise<void>;
  setStatus(id: string, status: ReportStatus): Promise<void>;
};

/** Catalog 공개 API 어댑터: 신고 대상 문항 존재 확인 */
export type QuestionExists = {
  exists(questionId: string): Promise<boolean>;
};

/** Catalog 공개 API 어댑터: 신고 목록에 붙일 문항 요약 (관리자 화면) */
export type QuestionSummaries = {
  summaries(questionIds: string[]): Promise<{ id: string; prompt: string; setId: string | null }[]>;
};

export type CommunityDeps = {
  user: CurrentUser | null;
  posts: PostRepo;
  reports: ReportRepo;
  questions: QuestionExists & QuestionSummaries;
  now: () => Date;
};
