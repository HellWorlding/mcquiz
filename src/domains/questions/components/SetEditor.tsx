"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuestionSet, QuestionWithChoices, Unit } from "@/domains/shared/types";
import { flattenTree, type TreeNode } from "@/domains/shared/tree";
import { deleteQuestionAction, deleteSetAction, updateChoiceAction, updateQuestionAction } from "@/domains/questions/admin-actions";
import { LOW_CONFIDENCE } from "@/domains/import/types";
import { QuestionBadges, SourceQuote } from "@/domains/shared/components/QuestionMeta";

export function SetEditor({ set, questions, unitTree }: { set: QuestionSet; questions: QuestionWithChoices[]; unitTree: TreeNode<Unit>[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const units = flattenTree(unitTree);
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3">
      {questions.map((q, i) => {
        const low = q.unit_confidence !== null && q.unit_confidence < LOW_CONFIDENCE;
        return (
          <div key={q.id} className={`card flex flex-col gap-2 ${q.needs_review ? "border-warn" : ""}`}>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>#{i + 1}</span>
              <div className="flex gap-1">
                {q.unit_id && (
                  <Link href={`/admin/sources?subject=${set.subject_id}&unit=${q.unit_id}`} className="btn-ghost btn-sm">
                    근거 스크립트
                  </Link>
                )}
                <button className="btn-ghost btn-sm text-bad" disabled={pending} onClick={() => run(() => deleteQuestionAction(q.id))}>
                  삭제
                </button>
              </div>
            </div>
            <QuestionBadges q={q} />
            <EditableText value={q.prompt} className="font-semibold" onSave={(v) => run(() => updateQuestionAction({ id: q.id, prompt: v }))} />
            <SourceQuote q={q} />
            <ul className="flex flex-col gap-1">
              {q.choices.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <button
                    className={`mt-1 size-7 shrink-0 rounded-full border-2 text-xs font-bold ${q.correct_choice === c.ord ? "border-ok bg-ok-soft text-ok" : "border-border text-muted"}`}
                    disabled={pending}
                    onClick={() => run(() => updateQuestionAction({ id: q.id, correctChoice: c.ord }))}
                  >
                    {c.ord}
                  </button>
                  <div className="flex-1">
                    <EditableText value={c.text} onSave={(v) => run(() => updateChoiceAction({ id: c.id, text: v }))} />
                    <EditableText
                      value={c.explanation ?? ""}
                      placeholder="해설 없음 (눌러서 입력)"
                      className="text-sm text-muted"
                      onSave={(v) => run(() => updateChoiceAction({ id: c.id, explanation: v || null }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <EditableText
              value={q.explanation ?? ""}
              placeholder="문항 해설 없음 (눌러서 입력)"
              className="text-sm"
              onSave={(v) => run(() => updateQuestionAction({ id: q.id, explanation: v || null }))}
            />
            <EditableText value={q.hint ?? ""} placeholder="힌트 없음" className="text-sm" onSave={(v) => run(() => updateQuestionAction({ id: q.id, hint: v || null }))} />
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={`input w-auto py-1 text-sm ${low ? "border-warn" : ""}`}
                value={q.unit_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => updateQuestionAction({ id: q.id, unitId: e.target.value || null }))}
              >
                <option value="">(단원 없음)</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {"　".repeat(u.depth)}
                    {u.no !== null ? `${u.no}. ` : ""}
                    {u.title}
                  </option>
                ))}
              </select>
              {low && <span className="badge bg-warn-soft text-warn">단원 확인 필요</span>}
              {q.needs_review && <span className="badge bg-warn-soft text-warn">정답 없음</span>}
              {q.tags.map((t) => (
                <span key={t} className="badge bg-accent-soft text-accent">
                  #{t}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <div className="card flex items-center justify-between">
        <span className="text-sm text-muted">세트 삭제는 되돌릴 수 없습니다.</span>
        {confirm ? (
          <button
            className="btn-danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteSetAction(set.id, set.subject_id);
                router.push("/admin");
              })
            }
          >
            정말 삭제
          </button>
        ) : (
          <button className="btn-danger btn-sm" onClick={() => setConfirm(true)}>
            세트 삭제
          </button>
        )}
      </div>
    </div>
  );
}

function EditableText({ value, onSave, className = "", placeholder }: { value: string; onSave: (v: string) => void; className?: string; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button
        className={`w-full whitespace-pre-wrap rounded-lg px-2 py-1 text-left hover:bg-accent-soft/30 ${className} ${!value ? "text-muted" : ""}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || placeholder || "(비어 있음)"}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <textarea className="input text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} autoFocus />
      <div className="flex gap-1">
        <button
          className="btn-primary btn-sm"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
        >
          저장
        </button>
        <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
          취소
        </button>
      </div>
    </div>
  );
}
