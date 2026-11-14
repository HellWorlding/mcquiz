import { notFound } from "next/navigation";
import { requireUser } from "@/domains/auth/session";
import { createClient } from "@/domains/auth/supabase/server";
import { SourceReader } from "@/domains/evidence/components/SourceReader";
import { sourceLabel } from "@/domains/evidence/search";
import { tokenize } from "@/domains/import/tokenize";
import { unitLabel } from "@/domains/shared/labels";

export const metadata = { title: "원문 보기" };

/** 자료(스크립트·책) 원문. 권한은 RLS(can_read_subject)가 결정한다 */
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
  const db = await createClient();
  const { data: s } = await db.from("sources").select("id, kind, title, page_range, subject_id, units(title, no), subjects(name)").eq("id", id).maybeSingle();
  if (!s) notFound();
  const { data: chunks } = await db.from("source_chunks").select("id, ord, page, content").eq("source_id", id).order("ord");
  const unit = s.units as unknown as { title: string; no: number | null } | null;
  const subject = s.subjects as unknown as { name: string } | null;
  const pageNo = page && /^\d+$/.test(page) ? Number(page) : null;
  const list = chunks ?? [];
  const target = (chunk && list.some((c) => c.id === chunk) ? chunk : null) ?? (pageNo !== null ? (list.find((c) => c.page === pageNo)?.id ?? null) : null);
  const unitTitle = unit ? unitLabel(unit.no, unit.title) : null;
  const targetPage = list.find((c) => c.id === target)?.page ?? pageNo;
  // 긴 토큰부터 최대 8개만 강조
  const tokens = q ? [...new Set(tokenize(q))].sort((a, b) => b.length - a.length).slice(0, 8) : [];
  return (
    <SourceReader
      label={sourceLabel(s.kind, unit?.no ?? null, s.kind === "book" ? targetPage : null, s.title)}
      title={s.title}
      kind={s.kind}
      subjectId={s.subject_id}
      subjectName={subject?.name ?? null}
      unitTitle={unitTitle}
      pageRange={s.page_range}
      chunks={list}
      targetChunkId={target}
      tokens={tokens}
    />
  );
}
