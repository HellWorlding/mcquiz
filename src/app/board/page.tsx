import { requireUser } from "@/contexts/access/server";
import { listPosts } from "@/contexts/community/ui/loaders";
import { BoardView } from "@/contexts/community/ui/components/BoardView";
import { env } from "@/shared/env";

export const metadata = { title: "게시판" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("/board");
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const { posts, pages, total } = await listPosts(page);
  return <BoardView posts={posts} page={page} pages={pages} total={total} userId={user.id} isAdmin={user.isAdmin} adminEmail={env.adminEmail} />;
}
