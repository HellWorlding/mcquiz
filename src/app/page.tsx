import Link from "next/link";
import { getCurrentUser } from "@/domains/auth/session";
import { listSubjects } from "@/domains/subjects/queries";
import { env } from "@/domains/shared/env";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await getCurrentUser();
  if (!user && !env.publicGuestAccess) {
    return (
      <section className="mt-10 text-center">
        <h1 className="text-3xl font-bold">mcquiz</h1>
        <p className="mt-3 text-muted">문제 파일을 올리면 바로 풀 수 있는 객관식 퀴즈 앱</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login" className="btn-primary">
            로그인
          </Link>
          <Link href="/signup" className="btn-secondary">
            회원가입
          </Link>
        </div>
      </section>
    );
  }
  const subjects = await listSubjects();
  return (
    <section>
      {error === "forbidden" && <p className="mb-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">접근 권한이 없습니다.</p>}
      <h1 className="mb-4 text-2xl font-bold">주제</h1>
      {subjects.length === 0 ? (
        <p className="card text-muted">아직 볼 수 있는 주제가 없습니다. 관리자에게 권한을 요청하세요.</p>
      ) : (
        <ul className="grid gap-3">
          {subjects.map((s) => (
            <li key={s.id}>
              <Link href={`/subjects/${s.id}`} className="card flex items-center justify-between hover:border-accent">
                <span className="text-lg font-semibold">{s.name}</span>
                <span className={`badge ${s.visibility === "restricted" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>
                  {s.visibility === "restricted" ? "제한" : "공개"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
