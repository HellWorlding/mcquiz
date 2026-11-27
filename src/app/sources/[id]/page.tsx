import { notFound } from "next/navigation";
import { requireUser } from "@/contexts/access/server";
import { loadSourceReader } from "@/contexts/knowledge/ui/loaders";
import { SourceReader } from "@/contexts/knowledge/ui/components/SourceReader";

export const metadata = { title: "원문 보기" };

/** 자료(스크립트·책) 원문. 권한은 RLS 가 결정한다 */
export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chunk?: string; page?: string; q?: string }>;
}) {
  const { id } = await params;
  const { chunk, page, q } = await searchParams;
  await requireUser(`/sources/${id}`);
  const data = await loadSourceReader(id, { chunk, page, q });
  if (!data) notFound();
  return <SourceReader {...data} />;
}
