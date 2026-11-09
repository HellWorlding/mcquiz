"use client";
import { useState, useTransition } from "react";
import { chatAction, type ChatMessage, type ChatReply } from "@/domains/evidence/actions";
import { useT } from "@/domains/shared/i18n-client";
import type { AiQuota } from "@/domains/evidence/quota";

type Turn = ChatMessage & { sources?: ChatReply["sources"] };

export function ChatPanel({
  subjectId,
  subjectName,
  questionId,
  questionPrompt,
  aiEnabled,
  initialQuota,
}: {
  subjectId: string;
  subjectName: string;
  questionId: string | null;
  questionPrompt: string | null;
  aiEnabled: boolean;
  initialQuota: AiQuota;
}) {
  const t = useT();
  const [quota, setQuota] = useState<AiQuota>(initialQuota);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    setError(null);
    startTransition(async () => {
      const r = await chatAction({ subjectId, questionId, messages: next.map(({ role, content }) => ({ role, content })) });
      if (r.ok) {
        setTurns([...next, { role: "assistant", content: r.data.answer, sources: r.data.sources }]);
        setQuota(r.data.quota);
      } else setError(r.error);
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-2xl font-bold">{t("chat.title")}</h1>
        <p className="text-sm text-muted">{t("chat.desc", { subject: subjectName })}</p>
        <p className={`mt-1 text-xs ${quota.remaining === 0 ? "text-bad" : "text-muted"}`}>
          {t("chat.quota", { remaining: quota.remaining, limit: quota.limit, hours: quota.windowHours })}
        </p>
      </div>
      {questionPrompt && (
        <div className="card text-sm">
          <div className="mb-1 text-xs font-semibold text-muted">{t("chat.context")}</div>
          <p className="whitespace-pre-wrap">{questionPrompt}</p>
        </div>
      )}
      {!aiEnabled && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{t("chat.disabled")}</p>}

      <div className="flex flex-col gap-3">
        {turns.map((turn, i) => (
          <div key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 ${turn.role === "user" ? "self-end bg-accent text-white" : "self-start bg-card border border-border"}`}>
            <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
            {turn.sources && turn.sources.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted">{t("chat.sources", { n: turn.sources.length })}</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {turn.sources.map((s, j) => (
                    <li key={j} className="rounded-lg bg-background p-2">
                      <span className="badge mr-1 bg-accent-soft text-accent">
                        [{j + 1}] {s.label}
                      </span>
                      <span className="text-muted">{s.snippet}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {pending && <div className="self-start rounded-2xl border border-border bg-card px-4 py-3 text-muted">{t("chat.thinking")}</div>}
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>

      <form
        className="sticky bottom-0 flex gap-2 bg-background py-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="input"
          placeholder={questionId ? t("chat.placeholder_q") : t("chat.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending || !aiEnabled || quota.remaining === 0}
        />
        <button className="btn-primary shrink-0" type="submit" disabled={pending || !aiEnabled || !input.trim() || quota.remaining === 0}>
          {t("chat.send")}
        </button>
      </form>
    </section>
  );
}
