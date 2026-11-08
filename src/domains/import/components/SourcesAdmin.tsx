"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Unit } from "@/domains/shared/types";
import { flattenTree, type TreeNode } from "@/domains/shared/tree";
import { deleteSourceAction, uploadSourcesAction } from "@/domains/import/actions";
import type { SourceUploadResult } from "@/domains/import/sources";

type SourceRow = { id: string; unit_id: string | null; kind: string; title: string; page_range: string | null; created_at: string };

export function SourcesAdmin({
  subjectId,
  unitTree,
  sources,
  filterUnit,
}: {
  subjectId: string;
  unitTree: TreeNode<Unit>[];
  sources: SourceRow[];
  filterUnit: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<SourceUploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const units = flattenTree(unitTree);
  const unitName = (id: string | null) => {
    const u = units.find((x) => x.id === id);
    return u ? `${u.no !== null ? `${u.no}. ` : ""}${u.title}` : "단원 미연결";
  };
  const visible = filterUnit ? sources.filter((s) => s.unit_id === filterUnit) : sources;

  return (
    <div className="flex flex-col gap-4">
      <form
        className="card flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const r = await uploadSourcesAction(fd);
            if (!r.ok) setError(r.error);
            else setResults(r.data);
            router.refresh();
          });
        }}
      >
        <input type="hidden" name="subject_id" value={subjectId} />
        <div className="font-bold">파일 올리기 (txt · md · pdf, 한 번에 60개까지)</div>
        <p className="text-sm text-muted">
          파일명에 &quot;N강&quot;, &quot;partN&quot; 처럼 번호가 있으면 그 단원에 자동 연결됩니다. 이름에 &quot;목차&quot;가 있거나 첫 줄이
          &quot;차시 (탭) 수업명&quot; 이면 목차로 보고 단원을 일괄 생성합니다.
        </p>
        <input name="files" type="file" multiple accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" className="input" required />
        <div className="flex flex-col gap-2 sm:flex-row">
          <select name="kind" className="input sm:w-40" defaultValue="script">
            <option value="script">강의 스크립트</option>
            <option value="note">정리 노트</option>
            <option value="book">책</option>
            <option value="other">기타</option>
          </select>
          <select name="parent_unit_id" className="input" defaultValue="">
            <option value="">상위 단원: 최상위 (파일명 번호를 최상위 단원과 맞춤)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {"　".repeat(u.depth)}
                {unitName(u.id)} 아래
              </option>
            ))}
          </select>
          <select name="unit_id" className="input" defaultValue="">
            <option value="">단원: 파일명으로 자동</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {"　".repeat(u.depth)}
                {unitName(u.id)} 에 모두 연결
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn-primary" disabled={pending}>
          {pending ? "올리는 중…" : "업로드"}
        </button>
        {results && (
          <ul className="flex flex-col gap-1 text-sm">
            {results.map((r, i) => (
              <li key={i} className={r.status === "skipped" ? "text-bad" : "text-ok"}>
                {r.filename}: {r.message}
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-bold">
            자료 {visible.length}개 {filterUnit && <span className="text-sm text-muted">· {unitName(filterUnit)}</span>}
          </div>
          {filterUnit && (
            <Link href={`/admin/sources?subject=${subjectId}`} className="btn-ghost btn-sm">
              전체 보기
            </Link>
          )}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {visible.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
              <Link href={`/admin/sources/${s.id}`} className="flex-1 hover:underline">
                {s.title}
              </Link>
              <span className="text-muted">{unitName(s.unit_id)}</span>
              <span className="badge bg-accent-soft text-accent">{s.kind}</span>
              <button
                className="btn-ghost btn-sm text-bad"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteSourceAction(s.id);
                    router.refresh();
                  })
                }
              >
                삭제
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="py-2 text-muted">자료가 없습니다.</li>}
        </ul>
      </div>
    </div>
  );
}
