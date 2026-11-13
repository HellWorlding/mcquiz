"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { findEvidenceAction, type EvidenceResult } from "@/domains/evidence/actions";
import { useT } from "@/domains/shared/i18n-client";

/** 문항 아래 "근거 찾기" 버튼 + 결과 목록 (단원 자료 우선, 없으면 전체) */
export function EvidencePanel({ questionId, subjectId, isAdmin = false, showChat = true }: { questionId: string; subjectId: string | null; isAdmin?: boolean; showChat?: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EvidenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = () =>
    startTransition(async () => {
      setError(null);
      const r = await findEvidenceAction(questionId);
      if (r.ok) setResult(r.data);
      else setError(r.error);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {!result && (
          <button className="btn-secondary btn-sm" onClick={load} disabled={pending}>
            {pending ? t("quiz.evidence_searching") : t("quiz.evidence")}
          </button>
        )}
        {showChat && subjectId && (
          <Link href={`/chat?subject=${subjectId}&question=${questionId}`} target="_blank" rel="noopener" className="btn-ghost btn-sm">
            {t("start.ask_ai")}
          </Link>
        )}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      {result && (
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="mb-2 text-xs font-semibold text-muted">
            {t("quiz.evidence_count", { n: result.hits.length })}{result.unitTitle && t("quiz.evidence_unit_first", { unit: result.unitTitle })}
          </div>
          {result.hits.length === 0 ? (
            <p className="text-sm text-muted">{t("quiz.evidence_none")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.hits.map((h) => (
                <li key={h.chunkId} className="rounded-lg bg-card p-2 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/sources/${h.sourceId}?chunk=${h.chunkId}${h.page ? `&page=${h.page}` : ""}`}
                      target="_blank"
                      rel="noopener"
                      title={t("source.open")}
                      className={`badge hover:underline ${h.kind === "book" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}
                    >
                      {h.label} ↗
                    </Link>
                    {h.scope === "all" && <span className="text-xs text-muted">{t("quiz.outside_unit")}</span>}
                    <button className="ml-auto text-xs text-accent" onClick={() => setOpen(open === h.chunkId ? null : h.chunkId)}>
                      {open === h.chunkId ? t("common.close") : t("quiz.show_full")}
                    </button>
                    {isAdmin && (
                      <Link href={`/admin/sources/${h.sourceId}`} className="text-xs text-muted underline">
                        {t("quiz.source")}
                      </Link>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{open === h.chunkId ? h.content : h.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
