import { countQuestionsByUnit, getUnitTree, listSubjects } from "@/contexts/catalog/ui/loaders";
import { UnitsAdmin } from "@/contexts/catalog/ui/components/UnitsAdmin";
import { SubjectPicker } from "@/contexts/catalog/ui/components/SubjectPicker";

export const metadata = { title: "단원 관리" };

export default async function UnitsAdminPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject } = await searchParams;
  const subjects = await listSubjects();
  const current = subjects.find((s) => s.id === subject) ?? subjects[0];
  if (!current) return <p className="card text-muted">먼저 과목을 만드세요.</p>;
  const [tree, counts] = await Promise.all([getUnitTree(current.id), countQuestionsByUnit(current.id)]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">단원 관리</h1>
        <SubjectPicker subjects={subjects} current={current.id} basePath="/admin/units" />
      </div>
      <UnitsAdmin subjectId={current.id} tree={tree} counts={counts} />
    </div>
  );
}
