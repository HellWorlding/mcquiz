"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subject } from "@/domains/shared/types";
import { createSubjectAction, grantMemberAction, revokeMemberAction, setSubjectVisibilityAction } from "@/domains/subjects/admin-actions";

type Profile = { id: string; email: string | null; display_name: string | null; is_admin: boolean };
type SetRow = { id: string; subject_id: string; title: string; created_at: string; count: number };

export function SubjectsAdmin({
  subjects,
  members,
  profiles,
  sets,
}: {
  subjects: Subject[];
  members: { subject_id: string; user_id: string }[];
  profiles: Profile[];
  sets: SetRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [emailBySubject, setEmailBySubject] = useState<Record<string, string>>({});
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setMsg(r.ok ? "완료" : (r.error ?? "실패"));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">주제·권한</h1>
      {msg && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">{msg}</p>}

      <form
        className="card flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => createSubjectAction(fd));
          e.currentTarget.reset();
        }}
      >
        <input name="name" className="input" placeholder="새 주제 이름" required />
        <select name="visibility" className="input sm:w-40" defaultValue="public">
          <option value="public">공개</option>
          <option value="restricted">제한</option>
        </select>
        <button className="btn-primary shrink-0" disabled={pending}>
          주제 만들기
        </button>
      </form>

      {subjects.map((s) => {
        const mem = members.filter((m) => m.subject_id === s.id);
        const subjectSets = sets.filter((x) => x.subject_id === s.id);
        return (
          <div key={s.id} className="card flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-bold">{s.name}</div>
              <select
                className="input w-auto py-1 text-sm"
                value={s.visibility}
                disabled={pending}
                onChange={(e) => run(() => setSubjectVisibilityAction(s.id, e.target.value as "public" | "restricted"))}
              >
                <option value="public">공개 (로그인한 모두)</option>
                <option value="restricted">제한 (허용된 사용자만)</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href={`/admin/units?subject=${s.id}`} className="btn-secondary btn-sm">
                단원 관리
              </Link>
              <Link href={`/admin/sources?subject=${s.id}`} className="btn-secondary btn-sm">
                스크립트
              </Link>
              <Link href={`/admin/upload?subject=${s.id}`} className="btn-secondary btn-sm">
                문제 업로드
              </Link>
            </div>

            <div>
              <div className="label">허용된 사용자 {s.visibility === "public" && "(공개 주제는 모두 볼 수 있음)"}</div>
              <ul className="flex flex-col gap-1">
                {mem.map((m) => {
                  const p = profileById.get(m.user_id);
                  return (
                    <li key={m.user_id} className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
                      <span>
                        {p?.email ?? m.user_id} {p?.display_name && <span className="text-muted">({p.display_name})</span>}
                      </span>
                      <button className="btn-danger btn-sm" disabled={pending} onClick={() => run(() => revokeMemberAction(s.id, m.user_id))}>
                        회수
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex gap-2">
                <input
                  className="input"
                  placeholder="이메일로 권한 주기"
                  type="email"
                  value={emailBySubject[s.id] ?? ""}
                  onChange={(e) => setEmailBySubject({ ...emailBySubject, [s.id]: e.target.value })}
                />
                <button
                  className="btn-primary btn-sm shrink-0"
                  disabled={pending || !(emailBySubject[s.id] ?? "").trim()}
                  onClick={() => {
                    run(() => grantMemberAction(s.id, emailBySubject[s.id] ?? ""));
                    setEmailBySubject({ ...emailBySubject, [s.id]: "" });
                  }}
                >
                  권한 부여
                </button>
              </div>
            </div>

            <div>
              <div className="label">문제 세트 {subjectSets.length}개</div>
              <ul className="flex flex-col gap-1 text-sm">
                {subjectSets.map((x) => (
                  <li key={x.id}>
                    <Link href={`/admin/sets/${x.id}`} className="flex justify-between rounded-lg bg-background px-3 py-2 hover:bg-accent-soft/40">
                      <span>{x.title}</span>
                      <span className="text-muted">{x.count}문항</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}

      <div className="card">
        <div className="label">가입 사용자 {profiles.length}명</div>
        <ul className="flex flex-col gap-1 text-sm">
          {profiles.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>
                {p.email} {p.display_name && <span className="text-muted">({p.display_name})</span>}
              </span>
              {p.is_admin && <span className="badge bg-accent-soft text-accent">관리자</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
