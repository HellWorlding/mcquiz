"use client";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Choice, QuestionWithChoices } from "@/domains/shared/types";
import { hashString, shuffled } from "@/domains/quiz/shuffle";
import { recordAttemptAction, saveProgressAction, setConfusedAction, type SessionAnswer } from "@/domains/quiz/actions";
import type { ResumeState } from "@/domains/quiz/resolve";
import { saveQuestionAction } from "@/domains/progress/actions";
import { QuestionBadges, SourceQuote } from "@/domains/shared/components/QuestionMeta";
import { EvidencePanel } from "@/domains/evidence/components/EvidencePanel";
import { cleanExplanation } from "@/domains/shared/labels";
import { NoteBox } from "@/domains/notes/components/NoteBox";
import { useT } from "@/domains/shared/i18n-client";

const pts = (q: QuestionWithChoices) => (q.points && q.points > 0 ? q.points : 1);

/** 메모에 붙여 넣을 글: 문항 해설 + 근거만 */
function explanationText(q: QuestionWithChoices): string | null {
  const parts: string[] = [];
  if (q.explanation) parts.push(q.explanation);
  if (q.source_quote) parts.push(`근거${q.source_page ? ` (책 p.${q.source_page})` : ""}: ${q.source_quote}`);
  const t = parts.filter(Boolean).join("\n\n");
  return t || null;
}
import { AddToCollection } from "./AddToCollection";

type Props = {
  questions: QuestionWithChoices[];
  title: string;
  subjectId: string | null;
  isGuest: boolean;
  isAdmin?: boolean;
  backHref: string;
  /** 선지 셔플 seed. 서버에서 만들어 넘겨야 hydration 이 어긋나지 않는다 */
  seed: number;
  /** 이어서 풀기 */
  resume: ResumeState | null;
  /** 내 메모 (question_id → content) */
  notes?: Record<string, string>;
};

type Answer = {
  selectedOrd: number | null; // 원본 선지 번호
  isCorrect: boolean | null;
  confused: boolean;
  attemptId: string | null;
};

/** 선지는 해설과 함께 객체째로 섞는다 (번호로 해설을 잇지 않는다) */
function shuffleChoices(q: QuestionWithChoices, salt: number): Choice[] {
  return shuffled(q.choices, hashString(q.id) ^ salt);
}

export function QuizRunner({ questions: initial, title, subjectId, isGuest, isAdmin = false, backHref, seed, resume, notes = {} }: Props) {
  const t = useT();
  const [questions, setQuestions] = useState(initial);
  const [idx, setIdx] = useState(resume?.position ?? 0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const out: Record<string, Answer> = {};
    for (const [qid, a] of Object.entries(resume?.answers ?? {})) out[qid] = { ...a, attemptId: null };
    return out;
  });
  const [sessionId, setSessionId] = useState<string | null>(resume?.id ?? null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const sessionRef = useRef<string | null>(resume?.id ?? null);
  const saving = useRef<Promise<void> | null>(null);

  /** 진행 상태를 DB 에 저장 (게스트는 건너뜀). 호출 순서를 지키려고 직렬화한다. */
  const persist = useCallback(
    (qs: QuestionWithChoices[], pos: number, ans: Record<string, Answer>, finished: boolean) => {
      if (isGuest) return;
      const compact: Record<string, SessionAnswer> = {};
      for (const [qid, a] of Object.entries(ans)) compact[qid] = { selectedOrd: a.selectedOrd, isCorrect: a.isCorrect, confused: a.confused };
      const run = async () => {
        const r = await saveProgressAction({
          sessionId: sessionRef.current,
          subjectId,
          title,
          questionIds: qs.map((q) => q.id),
          position: pos,
          answers: compact,
          finished,
        });
        if (r.ok && r.data && !sessionRef.current) {
          sessionRef.current = r.data;
          setSessionId(r.data);
          try {
            window.history.replaceState(window.history.state, "", `/quiz?session=${r.data}`);
          } catch {
            // 주소 교체 실패는 무시
          }
        }
      };
      saving.current = (saving.current ?? Promise.resolve()).then(run, run);
    },
    [isGuest, subjectId, title],
  );
  const [showHint, setShowHint] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [finished, setFinished] = useState(false);
  const [salt, setSalt] = useState(seed);

  const q = questions[idx];
  const order = useMemo(() => (q ? shuffleChoices(q, salt) : []), [q, salt]);
  const a = q ? answers[q.id] : undefined;
  const answered = !!a && a.selectedOrd !== null;

  const goTo = (i: number) => {
    setShowHint(false);
    setShowAll(false);
    setIdx(i);
  };

  const select = useCallback(
    async (choice: Choice) => {
      if (!q || answered) return;
      const isCorrect = q.correct_choice === null ? null : choice.ord === q.correct_choice;
      const prev = answers[q.id];
      const confused = prev?.confused ?? false;
      const nextAnswers = { ...answers, [q.id]: { selectedOrd: choice.ord, isCorrect, confused, attemptId: prev?.attemptId ?? null } };
      setAnswers(nextAnswers);
      if (isGuest) return;
      persist(questions, idx, nextAnswers, false);
      if (prev?.attemptId) {
        // 플래시카드에서 먼저 헷갈림을 눌러 둔 경우: 기존 기록은 두고 새 기록을 남긴다
      }
      const r = await recordAttemptAction({ questionId: q.id, selectedOrd: choice.ord, isCorrect, confused });
      if (r.ok && r.data) setAnswers((s) => ({ ...s, [q.id]: { ...s[q.id], attemptId: r.data } }));
    },
    [q, answered, answers, isGuest, persist, questions, idx],
  );

  const toggleConfused = useCallback(async () => {
    if (!q) return;
    const cur = answers[q.id];
    const next = !(cur?.confused ?? false);
    const nextAnswers = {
      ...answers,
      [q.id]: { selectedOrd: cur?.selectedOrd ?? null, isCorrect: cur?.isCorrect ?? null, confused: next, attemptId: cur?.attemptId ?? null },
    };
    setAnswers(nextAnswers);
    if (isGuest) return;
    persist(questions, idx, nextAnswers, false);
    if (cur?.attemptId) {
      await setConfusedAction(cur.attemptId, next);
    } else {
      const r = await recordAttemptAction({ questionId: q.id, selectedOrd: null, isCorrect: null, confused: next });
      if (r.ok && r.data) setAnswers((s) => ({ ...s, [q.id]: { ...s[q.id], attemptId: r.data } }));
    }
  }, [q, answers, isGuest, persist, questions, idx]);

  const goNext = () => {
    if (idx + 1 >= questions.length) {
      setFinished(true);
      persist(questions, idx, answers, true);
    } else {
      goTo(idx + 1);
      persist(questions, idx + 1, answers, false);
    }
  };

  const retryWrong = () => {
    const wrong = questions.filter((x) => answers[x.id]?.isCorrect === false || answers[x.id]?.isCorrect === null);
    if (wrong.length === 0) return;
    setQuestions(wrong);
    setAnswers({});
    goTo(0);
    setFinished(false);
    setSalt(Date.now() & 0xffff);
    // 다시 풀기는 새 세션으로 저장한다
    sessionRef.current = null;
    setSessionId(null);
    persist(wrong, 0, {}, false);
  };

  if (questions.length === 0) {
    return (
      <div className="card mt-6 text-center">
        <p className="text-muted">{t("quiz.empty")}</p>
        <Link href={backHref} className="btn-secondary mt-4">
          {t("quiz.back")}
        </Link>
      </div>
    );
  }

  if (finished) {
    const graded = questions.filter((x) => answers[x.id]?.selectedOrd !== null && answers[x.id]?.selectedOrd !== undefined);
    const correct = graded.filter((x) => answers[x.id]?.isCorrect === true);
    const wrong = questions.filter((x) => answers[x.id]?.isCorrect === false);
    const confused = questions.filter((x) => answers[x.id]?.confused);
    const totalPts = graded.reduce((s, x) => s + pts(x), 0);
    const gotPts = correct.reduce((s, x) => s + pts(x), 0);
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    return (
      <section className="flex flex-col gap-4">
        <div className="card text-center">
          <div className="text-sm text-muted">{title}</div>
          <div className="mt-1 text-4xl font-bold">{t("quiz.score_pts", { got: fmt(gotPts), total: fmt(totalPts) })}</div>
          <div className="mt-1 text-muted">
            {t("quiz.score_count", { correct: correct.length, total: graded.length, pct: totalPts ? Math.round((gotPts / totalPts) * 100) : 0 })}
          </div>
          {isGuest && <p className="mt-2 text-sm text-warn">{t("quiz.guest_warn")}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {wrong.length > 0 && (
              <button className="btn-primary" onClick={retryWrong}>
                {t("quiz.retry_wrong", { n: wrong.length })}
              </button>
            )}
            <Link href={backHref} className="btn-secondary">
              {t("quiz.home")}
            </Link>
          </div>
        </div>
        <ResultList title={t("quiz.wrong_list")} items={wrong} answers={answers} subjectId={subjectId} isGuest={isGuest} tone="bad" />
        <ResultList title={t("quiz.confused_list")} items={confused} answers={answers} subjectId={subjectId} isGuest={isGuest} tone="warn" />
      </section>
    );
  }


  const jump = (i: number) => {
    goTo(i);
    persist(questions, i, answers, false);
  };
  const navGrid = (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
      {questions.map((x, i) => {
        const an = answers[x.id];
        const done = an?.selectedOrd !== null && an?.selectedOrd !== undefined;
        const cls = !done
          ? "bg-card border-border"
          : an?.isCorrect
            ? "bg-ok-soft border-ok/40 text-ok"
            : an?.isCorrect === false
              ? "bg-bad-soft border-bad/40 text-bad"
              : "bg-warn-soft border-warn/40 text-warn";
        return (
          <button
            key={x.id}
            onClick={() => jump(i)}
            aria-current={i === idx ? "step" : undefined}
            className={`h-9 rounded-lg border text-sm font-semibold ${cls} ${i === idx ? "ring-2 ring-accent" : ""}`}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
    <section className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <Link href={backHref} className="btn-ghost btn-sm">
          {t("quiz.exit")}
        </Link>
        <span>
          {idx + 1} / {questions.length}
          {sessionId && <span className="ml-1 text-xs text-muted">{t("quiz.saved_badge")}</span>}
        </span>
        <span className="w-16" />
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full bg-accent transition-all" style={{ width: `${((idx + (answered ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>

      {(
        <div className="card">
          <QuestionBadges q={{ ...q, topic: answered ? q.topic : null }} showTraps={false} />
          <p className="mt-1 whitespace-pre-wrap text-xl font-semibold leading-relaxed">{q.prompt}</p>
          {q.needs_review && <p className="mt-2 text-sm text-warn">{t("quiz.no_answer_warn")}</p>}
          <ul className="mt-4 flex flex-col gap-2">
            {order.map((c, i) => {
              const picked = a?.selectedOrd === c.ord;
              const isAns = q.correct_choice !== null && c.ord === q.correct_choice;
              let cls = "border-border bg-card";
              if (answered) {
                if (isAns) cls = "border-ok bg-ok-soft";
                else if (picked) cls = "border-bad bg-bad-soft";
                else cls = "border-border opacity-70";
              }
              return (
                <li key={c.id}>
                  <button
                    onClick={() => select(c)}
                    disabled={answered}
                    className={`w-full rounded-xl border-2 px-4 py-3 text-left text-lg transition ${cls} ${!answered ? "active:scale-[0.99] hover:border-accent" : ""}`}
                  >
                    <span className="mr-2 font-bold text-muted">{i + 1}</span>
                    {c.text}
                  </button>
                </li>
              );
            })}
          </ul>
          {answered && (
            <div className="mt-3 flex flex-col gap-2">
              <div className={`text-lg font-bold ${a?.isCorrect ? "text-ok" : a?.isCorrect === false ? "text-bad" : "text-warn"}`}>
                {a?.isCorrect ? t("quiz.correct") : a?.isCorrect === false ? t("quiz.wrong") : t("quiz.ungraded")}
              </div>
              {q.explanation && (
                <div className="rounded-xl bg-background p-3">
                  <div className="mb-1 text-xs font-semibold text-muted">{t("common.explanation")}</div>
                  <p className="whitespace-pre-wrap text-base">{q.explanation}</p>
                </div>
              )}
              {q.choices.some((c) => c.explanation) && (
                <div className="rounded-xl bg-background p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted">{t("quiz.choice_explanations")}</span>
                    <button className="text-xs text-accent" onClick={() => setShowAll(!showAll)}>
                      {showAll ? t("common.close") : t("common.expand")}
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {order.map((c, i) => {
                      const isAns = q.correct_choice !== null && c.ord === q.correct_choice;
                      const picked = a?.selectedOrd === c.ord;
                      if (!showAll && !isAns && !picked) return null;
                      const ex = cleanExplanation(c.explanation);
                      if (!ex) return null;
                      return (
                        <li key={c.id} className={`whitespace-pre-wrap text-base ${isAns ? "text-ok" : picked ? "text-bad" : "text-muted"}`}>
                          <span className="mr-1 font-bold">{i + 1}</span>
                          {ex}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <SourceQuote q={q} />
              {q.trap_types.length > 0 && <QuestionBadges q={{ ...q, difficulty: null, topic: null, points: null }} />}
              {!isGuest && <EvidencePanel questionId={q.id} subjectId={subjectId} isAdmin={isAdmin} />}
              {!isGuest && <NoteBox key={q.id} questionId={q.id} initial={notes[q.id] ?? ""} compact importText={explanationText(q)} />}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {q.hint && (
          <button className="btn-secondary btn-sm" onClick={() => setShowHint(!showHint)}>
            {showHint ? t("quiz.hint_hide") : t("quiz.hint_show")}
          </button>
        )}
        <button
          className={`btn-sm rounded-xl border px-3 py-2 font-semibold ${a?.confused ? "border-warn bg-warn-soft text-warn" : "border-border"}`}
          onClick={toggleConfused}
        >
          {a?.confused ? t("quiz.confused_on") : t("quiz.confused")}
        </button>
        {!isGuest && (
          <button
            className={`btn-sm rounded-xl border px-3 py-2 font-semibold ${savedIds.has(q.id) ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
            onClick={() => {
              const next = !savedIds.has(q.id);
              setSavedIds((s) => {
                const n = new Set(s);
                if (next) n.add(q.id);
                else n.delete(q.id);
                return n;
              });
              void saveQuestionAction(q.id, next);
            }}
          >
            {savedIds.has(q.id) ? t("quiz.saved") : t("quiz.save")}
          </button>
        )}
        <div className="ml-auto flex gap-2">
          {idx > 0 && (
            <button className="btn-secondary btn-sm" onClick={() => goTo(idx - 1)}>
              {t("common.prev")}
            </button>
          )}
          <button className={answered ? "btn-primary" : "btn-secondary"} onClick={goNext}>
            {idx + 1 >= questions.length ? t("quiz.results") : answered ? t("common.next") : t("quiz.skip")}
          </button>
        </div>
      </div>
      {showHint && q.hint && <p className="card whitespace-pre-wrap text-base">{q.hint}</p>}
      <div className="card lg:hidden">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>{t("quiz.nav")}</span>
          <span>
            {Object.values(answers).filter((a) => a.selectedOrd !== null).length}/{questions.length}
          </span>
        </div>
        {navGrid}
      </div>
    </section>
    <aside className="sticky top-20 hidden w-56 shrink-0 lg:block">
      <div className="card">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>{t("quiz.nav")}</span>
          <span>
            {Object.values(answers).filter((a) => a.selectedOrd !== null).length}/{questions.length}
          </span>
        </div>
        {navGrid}
      </div>
    </aside>
    </div>
  );
}

function ResultList({
  title,
  items,
  answers,
  subjectId,
  isGuest,
  tone,
}: {
  title: string;
  items: QuestionWithChoices[];
  answers: Record<string, Answer>;
  subjectId: string | null;
  isGuest: boolean;
  tone: "bad" | "warn";
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className={`font-bold ${tone === "bad" ? "text-bad" : "text-warn"}`}>
          {title} ({items.length})
        </h2>
        {!isGuest && subjectId && <AddToCollection subjectId={subjectId} questionIds={items.map((q) => q.id)} />}
      </div>
      <ol className="mt-3 flex flex-col gap-3">
        {items.map((q, i) => {
          const ans = answers[q.id];
          const correct = q.choices.find((c) => c.ord === q.correct_choice);
          const picked = q.choices.find((c) => c.ord === ans?.selectedOrd);
          return (
            <li key={q.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <p className="font-semibold">
                {i + 1}. {q.prompt}
              </p>
              {picked && ans?.isCorrect === false && <p className="mt-1 text-sm text-bad">{t("quiz.my_answer")}: {picked.text}</p>}
              {correct && <p className="mt-1 text-sm text-ok">{t("common.answer")}: {correct.text}</p>}
              {correct?.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{cleanExplanation(correct.explanation)}</p>}
              {q.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{q.explanation}</p>}
              <SourceQuote q={q} className="mt-1" />
              <div className="mt-1">
                <QuestionBadges q={q} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
