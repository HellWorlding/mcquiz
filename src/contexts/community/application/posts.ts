import { err, ok, type Result } from "@/shared/result";
import { canDeletePost, validatePost, validatePostPatch } from "../domain/post";
import { DAILY_LIMIT, dayAgo, message, requireAdmin, requireUser } from "./guards";
import type { CommunityDeps, PostPage } from "./ports";

export const PAGE_SIZE = 10;

/** 게시판 한 페이지 (로그인 필요). page 는 1부터 */
export async function listPosts(deps: CommunityDeps, page: number): Promise<Result<PostPage>> {
  const u = requireUser(deps);
  if (!u.ok) return u;
  const p = Math.max(1, Math.floor(page) || 1);
  try {
    const { posts, total } = await deps.posts.list(p, PAGE_SIZE);
    return ok({ posts, total, page: p, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  } catch (e) {
    return err(message(e));
  }
}

/** 글쓰기: 길이 검증 + 하루 10개 */
export async function createPost(deps: CommunityDeps, input: { kind: string; title: string; body: string }): Promise<Result<void>> {
  const u = requireUser(deps);
  if (!u.ok) return u;
  const v = validatePost(input);
  if (!v.ok) return v;
  try {
    if ((await deps.posts.countSince(u.data.id, dayAgo(deps))) >= DAILY_LIMIT) return err(`하루에 ${DAILY_LIMIT}개까지 쓸 수 있습니다.`);
    await deps.posts.insert(u.data.id, v.data);
    return ok(undefined);
  } catch (e) {
    return err(message(e));
  }
}

/** 삭제: 작성자 또는 관리자만 (RLS 도 같은 규칙) */
export async function deletePost(deps: CommunityDeps, id: string): Promise<Result<void>> {
  const u = requireUser(deps);
  if (!u.ok) return u;
  try {
    const post = await deps.posts.byId(id);
    if (!post) return err("글을 찾을 수 없습니다.");
    if (!canDeletePost(post, u.data)) return err("작성자 또는 관리자만 지울 수 있습니다.");
    await deps.posts.delete(id);
    return ok(undefined);
  } catch (e) {
    return err(message(e));
  }
}

/** 관리자: 상태 변경·답글 */
export async function updatePost(deps: CommunityDeps, id: string, input: { status?: string; reply?: string | null }): Promise<Result<void>> {
  const a = requireAdmin(deps);
  if (!a.ok) return a;
  const v = validatePostPatch(input);
  if (!v.ok) return v;
  try {
    await deps.posts.update(id, v.data, deps.now());
    return ok(undefined);
  } catch (e) {
    return err(message(e));
  }
}
