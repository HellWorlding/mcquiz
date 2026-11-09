import Link from "next/link";
import { requireUser } from "@/domains/auth/session";
import { listSubjects } from "@/domains/subjects/queries";
import { getWeakSummary } from "@/domains/progress/queries";
import { getQuestionsByIds } from "@/domains/questions/queries";
import { listUnits } from "@/domains/subjects/queries";
import { WeakView } from "@/domains/progress/components/WeakView";
import { getT } from "@/domains/shared/i18n-server";

export const metadata = { title: "저장된 문제" };

export default async function WeakPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireUser("/weak");
  const t = await getT();
  const { subject } = await searchParams;
  const subjects = await listSubjects();
  const current = subjects.find((s) => s.id === subject) ?? subjects[0];
  if (!current) return <p className="card text-muted">{t("saved.no_subject")}</p>;
  // 요약과 단원 목록은 서로 독립이라 동시에 요청한다
  const [summary, units] = await Promise.all([getWeakSummary(current.id), listUnits(current.id)]);
  const ids = (summary?.items ?? []).map((i) => i.questionId);
  const questions = await getQuestionsByIds(ids);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("saved.title")}</h1>
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
      {summary && <WeakView subject={current} summary={summary} questions={questions} units={units} />}
    </section>
  );
}
