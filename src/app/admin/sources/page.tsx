import { getUnitTree, listSubjects } from "@/contexts/catalog/ui/loaders";
import { SubjectPicker } from "@/contexts/catalog/ui/components/SubjectPicker";
import { loadSourcesAdmin } from "@/contexts/knowledge/ui/loaders";
import { SourcesAdmin } from "@/contexts/knowledge/ui/components/SourcesAdmin";

export const metadata = { title: "스크립트·노트" };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ subject?: string; unit?: string }> }) {
  const { subject, unit } = await searchParams;
  const subjects = await listSubjects();
  const current = subjects.find((s) => s.id === subject) ?? subjects[0];
  if (!current) return <p className="card text-muted">먼저 과목을 만드세요.</p>;
  const [unitTree, sources] = await Promise.all([getUnitTree(current.id), loadSourcesAdmin(current.id)]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">스크립트·노트·책</h1>
        <SubjectPicker subjects={subjects} current={current.id} basePath="/admin/sources" />
      </div>
      <SourcesAdmin subjectId={current.id} unitTree={unitTree} sources={sources} filterUnit={unit ?? null} />
    </div>
  );
}
