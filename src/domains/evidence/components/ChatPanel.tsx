"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { chatAction, type ChatMessage, type ChatReply } from "@/domains/evidence/actions";
import { useT } from "@/domains/shared/i18n-client";
import type { AiQuota } from "@/domains/evidence/quota";
import type { AiMode } from "@/domains/evidence/mode";

/** 화면에 쌓이는 한 턴. saved = 예전에 나눈 대화(DB 에서 불러옴) */
export type Turn = ChatMessage & { sources?: ChatReply["sources"]; saved?: boolean };

/** 채팅에 기본으로 깔아 두는 문항 (문제 + 선지 + 해설). 꼬리 질문은 이 맥락 위에서 이어진다 */
export type ChatQuestion = {
  prompt: string;
  explanation: string | null;
  choices: { ord: number; text: string; correct: boolean }[];
};

const FOLLOWUPS_AFTER = ["chat.q_why", "chat.q_others", "chat.q_similar", "chat.q_examples", "chat.q_mistakes"] as const;
const FOLLOWUPS_BEFORE = ["chat.q_hint", "chat.q_concept", "chat.q_similar"] as const;

export type ChatThreadProps = {
  subjectId: string;
  subjectName: string;
  questionId: string | null;
  question: ChatQuestion | null;
  aiEnabled: boolean;
  initialQuota: AiQuota;
  mode: AiMode;
  /** false 면 아직 답을 고르기 전: 정답 표시를 숨기고 AI 도 힌트로만 돕는다 */
  revealed?: boolean;
  /** 이 문항으로 전에 나눈 대화 */
  initialTurns?: Turn[];
  /** 모달 안에 들어갈 때 (제목·설명 생략) */
  embedded?: boolean;
  /** 화면에 보인 선지 순서 (원본 ord 배열). AI 가 같은 번호로 말하게 한다 */
  choiceOrder?: number[];
};

/** 채팅 본체: 문항 맥락 카드 + 대화 + 꼬리 질문 + 입력창 */
export function ChatThread({ subjectId, subjectName, questionId, question, aiEnabled, initialQuota, mode, revealed = true, initialTurns = [], embedded = false, choiceOrder }: ChatThreadProps) {
  const t = useT();
  const [quota, setQuota] = useState<AiQuota>(initialQuota);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  // 내가 보내면 맨 아래(생각 중…)로, 답이 오면 그 답의 첫 줄이 보이게 스크롤
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const last = turns[turns.length - 1];
    if (!last) return;
    const id = requestAnimationFrame(() => {
      if (last.role === "assistant") lastRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      else endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [turns, pending]);

  const canAsk = aiEnabled && quota.remaining > 0 && !pending;

  const send = (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || !canAsk) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    setError(null);
    startTransition(async () => {
      const r = await chatAction({ subjectId, questionId, revealAnswer: revealed, choiceOrder, messages: next.map(({ role, content }) => ({ role, content })) });
      if (r.ok) {
        setTurns([...next, { role: "assistant", content: r.data.answer, sources: r.data.sources }]);
        setQuota(r.data.quota);
      } else setError(r.error);
    });
  };

  const followups = question ? (revealed ? FOLLOWUPS_AFTER : FOLLOWUPS_BEFORE) : [];
  const hasHistory = turns.some((x) => x.saved);

  return (
    <section className="flex flex-col gap-3">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">{t("chat.title")}</h1>
          <p className="text-sm text-muted">{t(mode === "grounded" ? "chat.desc" : "chat.desc_open", { subject: subjectName })}</p>
        </div>
      )}
      <p className={`text-xs ${quota.remaining === 0 ? "text-bad" : "text-muted"}`}>
        {t("chat.quota", { remaining: quota.remaining, limit: quota.limit, hours: quota.windowHours })}
      </p>
      {question && (
        <div className="card text-sm">
          <div className="mb-1 text-xs font-semibold text-muted">{t("chat.context")}</div>
          <p className="whitespace-pre-wrap font-semibold">{question.prompt}</p>
          <ol className="mt-2 flex flex-col gap-1">
            {question.choices.map((c) => (
              <li key={c.ord} className={`flex gap-2 rounded-lg px-2 py-1 ${revealed && c.correct ? "bg-ok-soft text-ok" : ""}`}>
                <span className="shrink-0 tabular-nums">{c.ord})</span>
                <span className="whitespace-pre-wrap">{c.text}</span>
                {revealed && c.correct && <span className="ml-auto shrink-0 text-xs font-semibold">✓ {t("chat.correct_mark")}</span>}
              </li>
            ))}
          </ol>
          {revealed && question.explanation && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">{t("common.explanation")}</summary>
              <p className="mt-1 whitespace-pre-wrap text-muted">{question.explanation}</p>
            </details>
          )}
          {!revealed && <p className="mt-2 text-xs text-warn">{t("chat.hint_mode")}</p>}
        </div>
      )}
      {!aiEnabled && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{t("chat.disabled")}</p>}

      <div className="flex flex-col gap-3">
        {hasHistory && <div className="text-center text-xs text-muted">{t("chat.history")}</div>}
        {turns.map((turn, i) => (
          <div
            key={i}
            ref={i === turns.length - 1 ? lastRef : undefined}
            className={`max-w-[92%] scroll-mt-2 rounded-2xl px-4 py-3 ${turn.role === "user" ? "self-end bg-accent text-white" : "self-start bg-card border border-border"} ${turn.saved ? "opacity-80" : ""}`}
          >
            <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
            {turn.sources && turn.sources.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted">{t("chat.sources", { n: turn.sources.length })}</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {turn.sources.map((s, j) => (
                    <li key={j} className="rounded-lg bg-background p-2">
                      <Link
                        href={s.kind === "book" && s.page ? `/sources/pdf?subject=${subjectId}&page=${s.page}` : `/sources/${s.sourceId}?chunk=${s.chunkId}${s.page ? `&page=${s.page}` : ""}`}
                        target="_blank"
                        rel="noopener"
                        className="badge mr-1 bg-accent-soft text-accent hover:underline"
                        title={t("source.open")}
                      >
                        [{j + 1}] {s.label} ↗
                      </Link>
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
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 bg-background py-2">
        {followups.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 self-center text-xs text-muted">{t("chat.followups")}</span>
            {followups.map((k) => (
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
            disabled={!canAsk}
          />
          <button className="btn-primary shrink-0" type="submit" disabled={!canAsk || !input.trim()}>
            {t("chat.send")}
          </button>
        </form>
      </div>
    </section>
  );
}

/** /chat 페이지용 (제목·설명 포함) */
export function ChatPanel(props: ChatThreadProps) {
  return <ChatThread {...props} />;
}
