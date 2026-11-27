import Link from "next/link";
import { getCurrentUser } from "@/contexts/access/server";
import { listSubjects } from "@/contexts/catalog/ui/loaders";
import { subjectActivity } from "@/contexts/learning/ui/loaders";
import { env } from "@/shared/env";
import { getT } from "@/shared/i18n/server";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!user && !env.publicGuestAccess) {
    return (
      <section className="mt-10 text-center">
        <h1 className="text-3xl font-bold">MCQuiz</h1>
        <p className="mt-3 text-muted">{t("home.tagline")}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login" className="btn-primary">
            {t("auth.login")}
          </Link>
          <Link href="/signup" className="btn-secondary">
            {t("auth.signup")}
          </Link>
        </div>
      </section>
    );
  }
  // 활동이 많은 과목(저장함 많음 → 최근 풀이 → 만든 순)을 먼저 보인다
  const [list, activity] = await Promise.all([listSubjects(), subjectActivity()]);
  const score = new Map(activity.map((a) => [a.subjectId, { weak: a.weakCount, last: a.lastAt ?? "" }]));
  const subjects = [...list].sort((a, b) => {
    const sa = score.get(a.id) ?? { weak: 0, last: "" };
    const sb = score.get(b.id) ?? { weak: 0, last: "" };
    return sb.weak - sa.weak || (sb.last > sa.last ? 1 : sb.last < sa.last ? -1 : 0) || a.createdAt.localeCompare(b.createdAt);
  });
  return (
    <section>
      {error === "forbidden" && <p className="mb-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{t("home.forbidden")}</p>}
      <h1 className="mb-4 text-2xl font-bold">{t("home.title")}</h1>
      {subjects.length === 0 ? (
        <p className="card text-muted">{t("home.empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {subjects.map((s) => (
            <li key={s.id}>
              <Link href={`/subjects/${s.id}`} className="card flex items-center justify-between hover:border-accent">
                <span className="text-lg font-semibold">{s.name}</span>
                <span className={`badge ${s.visibility === "restricted" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>
                  {s.visibility === "restricted" ? t("home.restricted") : t("home.public")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
