import { createClient } from "@/domains/auth/supabase/server";
import { buildTree } from "@/domains/shared/tree";
import { SubjectPicker } from "@/domains/subjects/components/SubjectPicker";
import { SourcesAdmin } from "@/domains/import/components/SourcesAdmin";

export const metadata = { title: "스크립트·노트" };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ subject?: string; unit?: string }> }) {
  const { subject, unit } = await searchParams;
  const db = await createClient();
  const { data: subjects } = await db.from("subjects").select("*").order("created_at");
  const current = (subjects ?? []).find((s) => s.id === subject) ?? subjects?.[0];
  if (!current) return <p className="card text-muted">먼저 주제를 만드세요.</p>;
  const [{ data: units }, { data: sources }] = await Promise.all([
    db.from("units").select("*").eq("subject_id", current.id),
    db.from("sources").select("id, unit_id, kind, title, page_range, created_at").eq("subject_id", current.id).order("created_at"),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">스크립트·노트·책</h1>
        <SubjectPicker subjects={subjects ?? []} current={current.id} basePath="/admin/sources" />
      </div>
      <SourcesAdmin subjectId={current.id} unitTree={buildTree(units ?? [])} sources={sources ?? []} filterUnit={unit ?? null} />
    </div>
  );
}
