import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/domains/auth/supabase/server";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: s } = await db.from("sources").select("*, units(title, no)").eq("id", id).maybeSingle();
  if (!s) notFound();
  const unit = s.units as unknown as { title: string; no: number | null } | null;
  return (
    <article className="flex flex-col gap-3">
      <Link href={`/admin/sources?subject=${s.subject_id}`} className="btn-ghost btn-sm self-start">
        ← 목록
      </Link>
      <h1 className="text-xl font-bold">{s.title}</h1>
      <p className="text-sm text-muted">
        {s.kind} · {unit ? `${unit.no ?? ""} ${unit.title}` : "단원 미연결"} {s.page_range && `· p.${s.page_range}`}
      </p>
      <pre className="card whitespace-pre-wrap font-sans text-base leading-relaxed">{s.content}</pre>
    </article>
  );
}
