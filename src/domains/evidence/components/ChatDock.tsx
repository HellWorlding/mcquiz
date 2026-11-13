"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { QuestionWithChoices } from "@/domains/shared/types";
import { openChatAction, type ChatOpenResult } from "@/domains/evidence/actions";
import { useT } from "@/domains/shared/i18n-client";
import { ChatThread, type ChatQuestion } from "./ChatPanel";

function toChatQuestion(q: QuestionWithChoices): ChatQuestion {
  return {
    prompt: q.prompt,
    explanation: q.explanation,
    choices: [...q.choices].sort((a, b) => a.ord - b.ord).map((c) => ({ ord: c.ord, text: c.text, correct: c.ord === q.correct_choice })),
  };
}

/**
 * 우하단 둥근 AI 버튼 + 채팅 모달. 문항이 바뀌면 부모가 key 를 바꿔서 대화를 새로 시작한다.
 * 열 때 한 번만 서버에서 남은 횟수·모드·이 문항의 예전 대화를 불러온다.
 */
export function ChatDock({
  subjectId,
  subjectName,
  question,
  revealed,
  open,
  onOpenChange,
}: {
  subjectId: string;
  subjectName: string;
  question: QuestionWithChoices | null;
  revealed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [ctx, setCtx] = useState<ChatOpenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requested = useRef(false);
  const qid = question?.id ?? null;

  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    startTransition(async () => {
      const r = await openChatAction(subjectId, qid);
      if (r.ok) setCtx(r.data);
      else setError(r.error);
    });
  }, [open, subjectId, qid]);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={t("chat.fab")}
          title={t("chat.fab")}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-sm font-bold text-white shadow-lg transition hover:scale-105 active:scale-95"
        >
          AI
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => onOpenChange(false)} />
          <div
            role="dialog"
            aria-label={t("chat.fab")}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(720px,85dvh)] sm:w-[460px] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="min-w-0">
                <div className="font-bold">{t("chat.fab")}</div>
                <div className="truncate text-xs text-muted">{subjectName}</div>
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={() => onOpenChange(false)} aria-label={t("common.close")}>
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-2 pt-3">
              {pending && !ctx && <p className="text-sm text-muted">{t("common.loading")}</p>}
              {error && <p className="text-sm text-bad">{error}</p>}
              {ctx && (
                <ChatThread
                  embedded
                  subjectId={subjectId}
                  subjectName={subjectName}
                  questionId={qid}
                  question={question ? toChatQuestion(question) : null}
                  aiEnabled={ctx.aiEnabled}
                  initialQuota={ctx.quota}
                  mode={ctx.mode}
                  revealed={revealed}
                  initialTurns={ctx.history.map((m) => ({ ...m, saved: true }))}
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
