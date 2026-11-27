import Link from "next/link";
import { requireUser } from "@/contexts/access/server";
import { listSubjectsByActivity as listSubjects } from "@/contexts/learning/ui/loaders";
import { loadSavedBox } from "@/contexts/learning/ui/loaders";
import { SavedBoxView } from "@/contexts/learning/ui/components/SavedBoxView";
import { getT } from "@/shared/i18n/server";

export const metadata = { title: "저장된 문항" };

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireUser("/saved");
  const t = await getT();
  const { subject } = await searchParams;
  const subjects = await listSubjects();
  const current = subjects.find((s) => s.id === subject) ?? subjects[0];
  if (!current) return <p className="card text-muted">{t("saved.no_subject")}</p>;
  const { summary, questions, units, roundScores } = await loadSavedBox(current.id);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("saved.title")}</h1>
      <div className="flex flex-wrap gap-2">
        {subjects.map((s) => (
          <Link
            key={s.id}
            href={`/saved?subject=${s.id}`}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${s.id === current.id ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>
      {summary && <SavedBoxView subject={current} summary={summary} questions={questions} units={units} roundScores={roundScores} />}
    </section>
  );
}
