/** Community 도메인: 게시글 (순수) */
import { err, ok, type Result } from "@/shared/result";

export const POST_KINDS = ["bug", "idea", "praise", "other"] as const;
export const POST_STATUSES = ["open", "progress", "done"] as const;
export type PostKind = (typeof POST_KINDS)[number];
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_TITLE_MAX = 80;
export const POST_BODY_MAX = 500;

export type Post = {
  id: string;
  userId: string;
  kind: PostKind;
  title: string;
  body: string;
  status: PostStatus;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
  /** posts_view 가 붙여 주는 표시 이름 (display_name 또는 이메일 앞부분) */
  author: string;
};

export type NewPost = { kind: PostKind; title: string; body: string };
export type PostPatch = { status?: PostStatus; adminReply?: string | null };

export function isPostKind(v: unknown): v is PostKind {
  return typeof v === "string" && (POST_KINDS as readonly string[]).includes(v);
}
export function isPostStatus(v: unknown): v is PostStatus {
  return typeof v === "string" && (POST_STATUSES as readonly string[]).includes(v);
}

/** 모르는 종류는 "기타"로 (옛 동작 유지). DB 에 들어온 값을 읽을 때도 쓴다 */
export function toPostKind(v: unknown): PostKind {
  return isPostKind(v) ? v : "other";
}
export function toPostStatus(v: unknown): PostStatus {
  return isPostStatus(v) ? v : "open";
}

/** 제목 1~80자, 본문 1~500자 (공백 제거 후). kind 는 열거값이 아니면 other */
export function validatePost(input: { kind: string; title: string; body: string }): Result<NewPost> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || title.length > POST_TITLE_MAX) return err(`제목은 1~${POST_TITLE_MAX}자입니다.`);
  if (!body || body.length > POST_BODY_MAX) return err(`내용은 1~${POST_BODY_MAX}자입니다.`);
  return ok({ kind: toPostKind(input.kind), title, body });
}

/**
 * 관리자 수정 입력 정리: status 는 열거값일 때만 적용, reply 는 undefined 면 그대로 두고 빈 문자열이면 null.
 * 바꿀 것이 하나도 없으면 실패.
 */
export function validatePostPatch(input: { status?: string; reply?: string | null }): Result<PostPatch> {
  const patch: PostPatch = {};
  if (input.status !== undefined) {
    if (!isPostStatus(input.status)) return err("알 수 없는 상태입니다.");
    patch.status = input.status;
  }
  if (input.reply !== undefined) patch.adminReply = input.reply?.trim() || null;
  if (patch.status === undefined && patch.adminReply === undefined) return err("바꿀 내용이 없습니다.");
  return ok(patch);
}

/** 글은 작성자 또는 관리자만 지운다 */
export function canDeletePost(post: { userId: string }, user: { id: string; isAdmin: boolean }): boolean {
  return user.isAdmin || post.userId === user.id;
}
