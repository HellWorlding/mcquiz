"use client";
import { useState, useTransition } from "react";
import { reportQuestionAction } from "@/domains/board/actions";
import { useT } from "@/domains/shared/i18n-client";

/** "신고" 버튼 + 모달 (새 페이지로 가지 않는다) */
export function ReportButton({ questionId }: { questionId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("answer");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await reportQuestionAction({ questionId, kind, message });
      if (r.ok) {
        setDone(t("report.done"));
        setMessage("");
      } else setError(r.error);
    });

  return (
    <>
      <button type="button" className="btn-ghost btn-sm text-muted" onClick={() => setOpen(true)}>
        {t("report.button")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">{t("report.title")}</h2>
              <button type="button" className="btn-ghost btn-sm text-lg leading-none" aria-label={t("common.cancel")} onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            {done ? (
              <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{done}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="answer">{t("report.kind_answer")}</option>
                  <option value="ambiguous">{t("report.kind_ambiguous")}</option>
                  <option value="typo">{t("report.kind_typo")}</option>
                  <option value="other">{t("report.kind_other")}</option>
                </select>
                <textarea
                  className="input min-h-24"
                  maxLength={100}
                  placeholder={t("report.placeholder")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 100))}
                />
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{message.length}/100</span>
                  {error && <span className="text-bad">{error}</span>}
                </div>
                <button type="button" className="btn-primary" disabled={pending || !message.trim()} onClick={submit}>
                  {pending ? t("auth.processing") : t("report.submit")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
