"use client";
import { useState, useTransition } from "react";
import { chatAction, type ChatMessage, type ChatReply } from "@/domains/evidence/actions";

type Turn = ChatMessage & { sources?: ChatReply["sources"] };

export function ChatPanel({
  subjectId,
  subjectName,
  questionId,
  questionPrompt,
  aiEnabled,
}: {
  subjectId: string;
  subjectName: string;
  questionId: string | null;
  questionPrompt: string | null;
  aiEnabled: boolean;
}) {
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
      if (r.ok) setTurns([...next, { role: "assistant", content: r.data.answer, sources: r.data.sources }]);
      else setError(r.error);
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-2xl font-bold">AI에게 묻기</h1>
        <p className="text-sm text-muted">
          {subjectName}의 강의 스크립트와 책에서 찾은 내용만 근거로 답하고, 출처(예: 40강 스크립트, 책 p.292)를 표시합니다.
        </p>
      </div>
      {questionPrompt && (
        <div className="card text-sm">
          <div className="mb-1 text-xs font-semibold text-muted">문항 맥락</div>
          <p className="whitespace-pre-wrap">{questionPrompt}</p>
        </div>
      )}
      {!aiEnabled && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">AI 기능이 꺼져 있습니다. 관리자가 OPENAI_API_KEY 를 설정하면 켜집니다.</p>}

      <div className="flex flex-col gap-3">
        {turns.map((t, i) => (
          <div key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 ${t.role === "user" ? "self-end bg-accent text-white" : "self-start bg-card border border-border"}`}>
            <p className="whitespace-pre-wrap leading-relaxed">{t.content}</p>
            {t.sources && t.sources.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted">참고한 자료 {t.sources.length}건</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {t.sources.map((s, j) => (
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
        {pending && <div className="self-start rounded-2xl border border-border bg-card px-4 py-3 text-muted">자료를 찾고 답을 쓰는 중…</div>}
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
          placeholder={questionId ? "이 문제에 대해 물어보세요 (예: 왜 3번이 틀렸어?)" : "궁금한 내용을 물어보세요"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending || !aiEnabled}
        />
        <button className="btn-primary shrink-0" type="submit" disabled={pending || !aiEnabled || !input.trim()}>
          보내기
        </button>
      </form>
    </section>
  );
}
