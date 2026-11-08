"use client";
import { useEffect, useState, useTransition } from "react";
import type { Collection } from "@/domains/shared/types";
import { addToCollectionAction, createCollectionAction, listMyCollectionsAction } from "@/domains/subjects/collection-actions";

/** "묶음에 추가" 버튼 + 간단한 선택 패널 (퀴즈 결과·약점 화면 공용) */
export function AddToCollection({ subjectId, questionIds, label = "묶음에 추가" }: { subjectId: string; questionIds: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || collections) return;
    listMyCollectionsAction(subjectId).then(setCollections);
  }, [open, collections, subjectId]);

  const add = (collectionId: string) =>
    startTransition(async () => {
      const r = await addToCollectionAction(collectionId, questionIds);
      setMsg(r.ok ? `${r.data}문항을 추가했습니다.` : r.error);
    });

  const createAndAdd = () =>
    startTransition(async () => {
      const r = await createCollectionAction({ subjectId, parentId: null, title: newTitle, scope: "private" });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setCollections((c) => [...(c ?? []), r.data]);
      setNewTitle("");
      const a = await addToCollectionAction(r.data.id, questionIds);
      setMsg(a.ok ? `"${r.data.title}" 묶음에 ${a.data}문항을 추가했습니다.` : a.error);
    });

  if (questionIds.length === 0) return null;
  return (
    <div className="relative">
      <button className="btn-secondary btn-sm" onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 text-sm font-semibold">어느 묶음에 넣을까요?</div>
          {collections === null ? (
            <p className="text-sm text-muted">불러오는 중…</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {collections.map((c) => (
                <li key={c.id}>
                  <button className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-accent-soft/40" disabled={pending} onClick={() => add(c.id)}>
                    {c.title} <span className="text-xs text-muted">{c.scope === "shared" ? "공용" : "개인"}</span>
                  </button>
                </li>
              ))}
              {collections.length === 0 && <li className="px-2 py-1 text-sm text-muted">묶음이 없습니다.</li>}
            </ul>
          )}
          <div className="mt-2 flex gap-1">
            <input className="input py-2 text-sm" placeholder="새 묶음 이름" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <button className="btn-primary btn-sm shrink-0" disabled={pending || !newTitle.trim()} onClick={createAndAdd}>
              만들고 추가
            </button>
          </div>
          {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
        </div>
      )}
    </div>
  );
}
