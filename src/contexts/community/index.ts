// community 컨텍스트 공개 API. 다른 컨텍스트와 src/app, scripts 는 이 파일만 import 한다.
export type { Post, PostKind, PostStatus, NewPost, PostPatch } from "./domain/post";
export { POST_KINDS, POST_STATUSES, validatePost, validatePostPatch } from "./domain/post";
export type { QuestionReport, ReportKind, ReportStatus, NewReport } from "./domain/report";
export { REPORT_KINDS, REPORT_STATUSES, validateReport } from "./domain/report";
export type { CommunityDeps, PostPage, PostRepo, ReportRepo, QuestionExists, QuestionSummaries } from "./application/ports";
export type { CommunityApi } from "./application/api";
export type { ReportRow } from "./application/reports";
export { listPosts, createPost, deletePost, updatePost, PAGE_SIZE } from "./application/posts";
export { reportQuestion, resolveReport, listReports } from "./application/reports";
/** 문항 신고 버튼(learning ui)이 호출하는 서버 액션. 다른 컨텍스트의 ui 는 index 를 거쳐야 하므로 여기서 내보낸다 */
