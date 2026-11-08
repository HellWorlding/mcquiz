import Link from "next/link";
import { requireUser } from "@/domains/auth/session";
import { listSubjects } from "@/domains/subjects/queries";
import { getWeakSummary } from "@/domains/progress/queries";
import { getQuestionsByIds } from "@/domains/questions/queries";
import { WeakView } from "@/domains/progress/components/WeakView";

export const metadata = { title: "약점 모음" };

export default async function WeakPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireUser("/weak");
  const { subject } = await searchParams;
  const subjects = await listSubjects();
  const current = subjects.find((s) => s.id === subject) ?? subjects[0];
  if (!current) return <p className="card text-muted">볼 수 있는 주제가 없습니다.</p>;
  const summary = await getWeakSummary(current.id);
  const ids = [...new Set([...(summary?.wrongIds ?? []), ...(summary?.confusedIds ?? [])])];
  const questions = await getQuestionsByIds(ids);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">약점 모음</h1>
      <div className="flex flex-wrap gap-2">
        {subjects.map((s) => (
          <Link
            key={s.id}
            href={`/weak?subject=${s.id}`}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${s.id === current.id ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>
      {summary && <WeakView subject={current} summary={summary} questions={questions} />}
    </section>
  );
}
