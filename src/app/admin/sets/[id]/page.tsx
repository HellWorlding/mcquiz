import Link from "next/link";
import { notFound } from "next/navigation";
import { getSet, getUnitTree, listSetQuestions } from "@/contexts/catalog/ui/loaders";
import { SetEditor } from "@/contexts/catalog/ui/components/SetEditor";

export default async function SetAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const set = await getSet(id);
  if (!set) notFound();
  const [questions, unitTree] = await Promise.all([listSetQuestions(id), getUnitTree(set.subjectId)]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{set.title}</h1>
          <p className="text-sm text-muted">
            {questions.length}문항 {set.sourceFilename && `· ${set.sourceFilename}`}
          </p>
        </div>
        <Link href={`/quiz?set=${set.id}&count=all&order=seq`} className="btn-primary btn-sm">
          풀어보기
        </Link>
      </div>
      <SetEditor set={set} questions={questions} unitTree={unitTree} />
    </div>
  );
}
