import { getUnitTree, listSubjects } from "@/contexts/catalog/ui/loaders";
import { UploadWizard } from "@/contexts/catalog/ui/components/UploadWizard";

export const metadata = { title: "문제 업로드" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject } = await searchParams;
  const subjects = await listSubjects();
  const current = subjects.find((s) => s.id === subject) ?? subjects[0];
  if (!current) return <p className="card text-muted">먼저 주제를 만드세요.</p>;
  const unitTree = await getUnitTree(current.id);
  return <UploadWizard subjects={subjects} currentSubjectId={current.id} unitTree={unitTree} />;
}
