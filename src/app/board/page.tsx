import { requireUser } from "@/domains/auth/session";
import { listPosts } from "@/domains/board/queries";
import { BoardView } from "@/domains/board/components/BoardView";
import { env } from "@/domains/shared/env";

export const metadata = { title: "게시판" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("/board");
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const { posts, pages, total } = await listPosts(page);
  return <BoardView posts={posts} page={page} pages={pages} total={total} userId={user.id} isAdmin={user.isAdmin} adminEmail={env.adminEmail} />;
}
