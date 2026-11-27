"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Question, QuestionSet, Unit } from "../../domain/types";
import { flattenTree, type TreeNode } from "../../domain/tree";
import { deleteQuestionAction, deleteSetAction, updateChoiceAction, updateQuestionAction } from "../actions";
import { LOW_CONFIDENCE } from "../../domain/import/types";
import { QuestionBadges, SourceQuote } from "@/shared/ui/QuestionMeta";
import { metaOf } from "./meta";

type Outcome = { ok: true } | { ok: false; error: string };

export function SetEditor({ set, questions, unitTree }: { set: QuestionSet; questions: Question[]; unitTree: TreeNode<Unit>[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const units = flattenTree(unitTree);
  /** 저장 결과가 실패면 메시지를 보이고 false (편집 중이던 입력은 그대로 둔다), 성공이면 새로고침하고 true */
  const run = (fn: () => Promise<Outcome>) =>
    new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const r = await fn();
        if (!r.ok) {
          setError(r.error);
          resolve(false);
          return;
        }
        setError(null);
        router.refresh();
        resolve(true);
      }),
    );
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="card border-bad text-sm text-bad">
          저장하지 못했습니다: {error}
        </p>
      )}
      {questions.map((q, i) => {
        const low = q.unitConfidence !== null && q.unitConfidence < LOW_CONFIDENCE;
        return (
          <div key={q.id} className={`card flex flex-col gap-2 ${q.needsReview ? "border-warn" : ""}`}>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>#{i + 1}</span>
              <div className="flex gap-1">
                {q.unitId && (
                  <Link href={`/admin/sources?subject=${set.subjectId}&unit=${q.unitId}`} className="btn-ghost btn-sm">
                    근거 스크립트
                  </Link>
                )}
                <button className="btn-ghost btn-sm text-bad" disabled={pending} onClick={() => run(() => deleteQuestionAction(q.id))}>
                  삭제
                </button>
              </div>
            </div>
            <QuestionBadges q={metaOf(q)} />
            <EditableText value={q.prompt} className="font-semibold" onSave={(v) => run(() => updateQuestionAction({ id: q.id, prompt: v }))} />
            <SourceQuote q={metaOf(q)} />
            <ul className="flex flex-col gap-1">
              {q.choices.map((c) => (
                <li key={c.ord} className="flex items-start gap-2">
                  <button
                    className={`mt-1 size-7 shrink-0 rounded-full border-2 text-xs font-bold ${q.correctChoice === c.ord ? "border-ok bg-ok-soft text-ok" : "border-border text-muted"}`}
                    disabled={pending}
                    onClick={() => run(() => updateQuestionAction({ id: q.id, correctChoice: c.ord }))}
                  >
                    {c.ord}
                  </button>
                  <div className="flex-1">
                    <EditableText value={c.text} onSave={(v) => run(() => updateChoiceAction({ questionId: q.id, ord: c.ord, text: v }))} />
                    <EditableText
                      value={c.explanation ?? ""}
                      placeholder="해설 없음 (눌러서 입력)"
                      className="text-sm text-muted"
                      onSave={(v) => run(() => updateChoiceAction({ questionId: q.id, ord: c.ord, explanation: v || null }))}
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
                value={q.unitId ?? ""}
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
              {q.needsReview && <span className="badge bg-warn-soft text-warn">정답 없음</span>}
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
                const r = await deleteSetAction(set.id, set.subjectId);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
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

function EditableText({ value, onSave, className = "", placeholder }: { value: string; onSave: (v: string) => Promise<boolean>; className?: string; placeholder?: string }) {
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
          onClick={async () => {
            // 저장이 실패하면 편집 상태와 입력을 그대로 둔다
            if (await onSave(draft)) setEditing(false);
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
