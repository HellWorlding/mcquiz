import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSourceDetail } from "@/contexts/knowledge/ui/loaders";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadSourceDetail(id);
  if (!data) notFound();
  const { source: s, content, unitText } = data;
  return (
    <article className="flex flex-col gap-3">
      <Link href={`/admin/sources?subject=${s.subjectId}`} className="btn-ghost btn-sm self-start">
        ← 목록
      </Link>
      <h1 className="text-xl font-bold">{s.title}</h1>
      <p className="text-sm text-muted">
        {s.kind} · {unitText ?? "단원 미연결"} {s.pageRange && `· p.${s.pageRange}`}
      </p>
      <pre className="card whitespace-pre-wrap font-sans text-base leading-relaxed">{content}</pre>
    </article>
  );
}
