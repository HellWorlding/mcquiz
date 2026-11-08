import { createClient } from "@/domains/auth/supabase/server";
import { buildTree } from "@/domains/shared/tree";
import { UnitsAdmin } from "@/domains/subjects/components/UnitsAdmin";
import { SubjectPicker } from "@/domains/subjects/components/SubjectPicker";

export const metadata = { title: "단원 관리" };

export default async function UnitsAdminPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject } = await searchParams;
  const db = await createClient();
  const { data: subjects } = await db.from("subjects").select("*").order("created_at");
  const current = (subjects ?? []).find((s) => s.id === subject) ?? subjects?.[0];
  if (!current) return <p className="card text-muted">먼저 주제를 만드세요.</p>;
  const [{ data: units }, { data: qs }] = await Promise.all([
    db.from("units").select("*").eq("subject_id", current.id),
    db.from("questions").select("unit_id").eq("subject_id", current.id),
  ]);
  const counts: Record<string, number> = {};
  for (const q of qs ?? []) if (q.unit_id) counts[q.unit_id] = (counts[q.unit_id] ?? 0) + 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">단원 관리</h1>
        <SubjectPicker subjects={subjects ?? []} current={current.id} basePath="/admin/units" />
      </div>
      <UnitsAdmin subjectId={current.id} tree={buildTree(units ?? [])} counts={counts} />
    </div>
  );
}
