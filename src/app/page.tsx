import Link from "next/link";
import { getCurrentUser } from "@/domains/auth/session";
import { listSubjects } from "@/domains/subjects/queries";
import { env } from "@/domains/shared/env";
import { getT } from "@/domains/shared/i18n-server";

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
  const subjects = await listSubjects();
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
