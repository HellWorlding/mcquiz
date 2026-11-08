import { createClient } from "@/domains/auth/supabase/server";
import { buildTree } from "@/domains/shared/tree";
import { UploadWizard } from "@/domains/import/components/UploadWizard";

export const metadata = { title: "문제 업로드" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject } = await searchParams;
  const db = await createClient();
  const { data: subjects } = await db.from("subjects").select("*").order("created_at");
  const current = (subjects ?? []).find((s) => s.id === subject) ?? subjects?.[0];
  if (!current) return <p className="card text-muted">먼저 주제를 만드세요.</p>;
  const { data: units } = await db.from("units").select("*").eq("subject_id", current.id);
  return <UploadWizard subjects={subjects ?? []} currentSubjectId={current.id} unitTree={buildTree(units ?? [])} />;
}
