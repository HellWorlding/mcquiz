"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Unit } from "@/domains/shared/types";
import { flattenTree, type TreeNode } from "@/domains/shared/tree";
import { bulkCreateUnitsAction, createUnitAction, deleteUnitAction, moveUnitAction, renameUnitAction } from "@/domains/subjects/admin-actions";

export function UnitsAdmin({ subjectId, tree, counts }: { subjectId: string; tree: TreeNode<Unit>[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState("");
  const [no, setNo] = useState("");
  const [bulk, setBulk] = useState({ prefix: "파트", from: "1", to: "10", suffix: "" });
  const flat = flattenTree(tree);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setMsg(r.ok ? null : (r.error ?? "실패"));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {msg && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{msg}</p>}

      <div className="card">
        {flat.length === 0 ? (
          <p className="text-muted">단원이 없습니다. 아래에서 추가하거나 스크립트 화면에서 목차 파일을 올리세요.</p>
        ) : (
          <ul className="flex flex-col">
            {flat.map((u) => (
              <UnitEditor key={u.id} unit={u} count={counts[u.id] ?? 0} pending={pending} run={run} />
            ))}
          </ul>
        )}
      </div>

      <div className="card flex flex-col gap-2">
        <div className="font-bold">단원 추가</div>
        <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">최상위</option>
          {flat.map((u) => (
            <option key={u.id} value={u.id}>
              {"　".repeat(u.depth)}
              {u.no !== null ? `${u.no}. ` : ""}
              {u.title}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input className="input w-24" placeholder="번호" inputMode="numeric" value={no} onChange={(e) => setNo(e.target.value)} />
          <input className="input" placeholder="단원 이름" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <button
          className="btn-primary"
          disabled={pending || !title.trim()}
          onClick={() => {
            run(() => createUnitAction({ subjectId, parentId: parentId || null, title, no: no ? Number(no) : null }));
            setTitle("");
            setNo("");
          }}
        >
          추가
        </button>
      </div>

      <div className="card flex flex-col gap-2">
        <div className="font-bold">번호 범위로 한 번에 만들기</div>
        <p className="text-sm text-muted">예: 접두 &quot;파트&quot;, 1~30 → 파트1 … 파트30. 위에서 고른 상위 단원 아래에 만들어집니다.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input w-28" placeholder="접두" value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} />
          <input className="input w-20" placeholder="부터" inputMode="numeric" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} />
          <input className="input w-20" placeholder="까지" inputMode="numeric" value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} />
          <input className="input w-28" placeholder="접미(선택)" value={bulk.suffix} onChange={(e) => setBulk({ ...bulk, suffix: e.target.value })} />
        </div>
        <button
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            run(() =>
              bulkCreateUnitsAction({
                subjectId,
                parentId: parentId || null,
                prefix: bulk.prefix,
                from: Number(bulk.from),
                to: Number(bulk.to),
                suffix: bulk.suffix,
              }),
            )
          }
        >
          일괄 생성
        </button>
      </div>
    </div>
  );
}

function UnitEditor({
  unit,
  count,
  pending,
  run,
}: {
  unit: TreeNode<Unit>;
  count: number;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(unit.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <li className="flex items-center gap-2 border-b border-border py-2 last:border-b-0" style={{ paddingLeft: unit.depth * 16 }}>
      {editing ? (
        <input className="input py-1" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      ) : (
        <span className="flex-1">
          {unit.no !== null && <span className="text-muted">{unit.no}. </span>}
          {unit.title} <span className="text-xs text-muted">({count})</span>
        </span>
      )}
      <div className="ml-auto flex shrink-0 gap-1">
        {editing ? (
          <button
            className="btn-primary btn-sm"
            disabled={pending}
            onClick={() => {
              run(() => renameUnitAction(unit.id, title));
              setEditing(false);
            }}
          >
            저장
          </button>
        ) : (
          <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
            이름
          </button>
        )}
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => moveUnitAction(unit.id, "up"))} aria-label="위로">
          ↑
        </button>
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => moveUnitAction(unit.id, "down"))} aria-label="아래로">
          ↓
        </button>
        {confirmDelete ? (
          <button className="btn-danger btn-sm" disabled={pending} onClick={() => run(() => deleteUnitAction(unit.id))}>
            정말 삭제
          </button>
        ) : (
          <button className="btn-ghost btn-sm text-bad" onClick={() => setConfirmDelete(true)}>
            삭제
          </button>
        )}
      </div>
    </li>
  );
}
