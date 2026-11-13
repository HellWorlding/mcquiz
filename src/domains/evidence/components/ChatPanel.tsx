"use client";
import { useState, useTransition } from "react";
import { chatAction, type ChatMessage, type ChatReply } from "@/domains/evidence/actions";
import { useT } from "@/domains/shared/i18n-client";
import type { AiQuota } from "@/domains/evidence/quota";
import type { AiMode } from "@/domains/evidence/mode";

type Turn = ChatMessage & { sources?: ChatReply["sources"] };

/** 채팅에 기본으로 깔아 두는 문항 (문제 + 선지 + 해설). 꼬리 질문은 이 맥락 위에서 이어진다 */
export type ChatQuestion = {
  prompt: string;
  explanation: string | null;
  choices: { ord: number; text: string; correct: boolean }[];
};

const FOLLOWUPS = ["chat.q_why", "chat.q_others", "chat.q_similar", "chat.q_examples", "chat.q_mistakes"] as const;

export function ChatPanel({
  subjectId,
  subjectName,
  questionId,
  question,
  aiEnabled,
  initialQuota,
  mode,
}: {
  subjectId: string;
  subjectName: string;
  questionId: string | null;
  question: ChatQuestion | null;
  aiEnabled: boolean;
  initialQuota: AiQuota;
  mode: AiMode;
}) {
  const t = useT();
  const [quota, setQuota] = useState<AiQuota>(initialQuota);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canAsk = aiEnabled && quota.remaining > 0 && !pending;

  const send = (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || !canAsk) return;
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
        <p className="text-sm text-muted">{t(mode === "grounded" ? "chat.desc" : "chat.desc_open", { subject: subjectName })}</p>
        <p className={`mt-1 text-xs ${quota.remaining === 0 ? "text-bad" : "text-muted"}`}>
          {t("chat.quota", { remaining: quota.remaining, limit: quota.limit, hours: quota.windowHours })}
        </p>
      </div>
      {question && (
        <div className="card text-sm">
          <div className="mb-1 text-xs font-semibold text-muted">{t("chat.context")}</div>
          <p className="whitespace-pre-wrap font-semibold">{question.prompt}</p>
          <ol className="mt-2 flex flex-col gap-1">
            {question.choices.map((c) => (
              <li key={c.ord} className={`flex gap-2 rounded-lg px-2 py-1 ${c.correct ? "bg-ok-soft text-ok" : ""}`}>
                <span className="shrink-0 tabular-nums">{c.ord})</span>
                <span className="whitespace-pre-wrap">{c.text}</span>
                {c.correct && <span className="ml-auto shrink-0 text-xs font-semibold">✓ {t("chat.correct_mark")}</span>}
              </li>
            ))}
          </ol>
          {question.explanation && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">{t("common.explanation")}</summary>
              <p className="mt-1 whitespace-pre-wrap text-muted">{question.explanation}</p>
            </details>
          )}
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
        {pending && <div className="self-start rounded-2xl border border-border bg-card px-4 py-3 text-muted">{t(mode === "grounded" ? "chat.thinking" : "chat.thinking_open")}</div>}
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 bg-background py-2">
      {question && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 self-center text-xs text-muted">{t("chat.followups")}</span>
          {FOLLOWUPS.map((k) => (
            <button key={k} type="button" className="btn-secondary btn-sm shrink-0 whitespace-nowrap" disabled={!canAsk} onClick={() => send(t(k))}>
              {t(k)}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="input"
          placeholder={questionId ? t("chat.placeholder_q") : t(mode === "grounded" ? "chat.placeholder" : "chat.placeholder_open")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending || !aiEnabled || quota.remaining === 0}
        />
        <button className="btn-primary shrink-0" type="submit" disabled={!canAsk || !input.trim()}>
          {t("chat.send")}
        </button>
      </form>
      </div>
    </section>
  );
}
