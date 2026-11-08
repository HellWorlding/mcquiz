"use client";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Choice, QuestionWithChoices } from "@/domains/shared/types";
import { hashString, shuffled } from "@/domains/quiz/shuffle";
import { recordAttemptAction, saveProgressAction, setConfusedAction, type SessionAnswer } from "@/domains/quiz/actions";
import type { ResumeState } from "@/domains/quiz/resolve";
import { AddToCollection } from "./AddToCollection";

type Props = {
  questions: QuestionWithChoices[];
  title: string;
  subjectId: string | null;
  isGuest: boolean;
  backHref: string;
  /** 선지 셔플 seed. 서버에서 만들어 넘겨야 hydration 이 어긋나지 않는다 */
  seed: number;
  /** 이어서 풀기 */
  resume: ResumeState | null;
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

export function QuizRunner({ questions: initial, title, subjectId, isGuest, backHref, seed, resume }: Props) {
  const [questions, setQuestions] = useState(initial);
  const [idx, setIdx] = useState(resume?.position ?? 0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const out: Record<string, Answer> = {};
    for (const [qid, a] of Object.entries(resume?.answers ?? {})) out[qid] = { ...a, attemptId: null };
    return out;
  });
  const [sessionId, setSessionId] = useState<string | null>(resume?.id ?? null);
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
        }
      };
      saving.current = (saving.current ?? Promise.resolve()).then(run, run);
    },
    [isGuest, subjectId, title],
  );
  const [flashcard, setFlashcard] = useState(false);
  const [flipped, setFlipped] = useState(false);
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
    setFlipped(false);
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
        <p className="text-muted">풀 문항이 없습니다.</p>
        <Link href={backHref} className="btn-secondary mt-4">
          돌아가기
        </Link>
      </div>
    );
  }

  if (finished) {
    const graded = questions.filter((x) => answers[x.id]?.selectedOrd !== null && answers[x.id]?.selectedOrd !== undefined);
    const correct = graded.filter((x) => answers[x.id]?.isCorrect === true);
    const wrong = questions.filter((x) => answers[x.id]?.isCorrect === false);
    const confused = questions.filter((x) => answers[x.id]?.confused);
    return (
      <section className="flex flex-col gap-4">
        <div className="card text-center">
          <div className="text-sm text-muted">{title}</div>
          <div className="mt-1 text-4xl font-bold">
            {correct.length} / {graded.length}
          </div>
          <div className="mt-1 text-muted">{graded.length ? Math.round((correct.length / graded.length) * 100) : 0}% 정답</div>
          {isGuest && <p className="mt-2 text-sm text-warn">로그인하지 않아 풀이 기록이 저장되지 않았습니다.</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {wrong.length > 0 && (
              <button className="btn-primary" onClick={retryWrong}>
                틀린 것만 다시 풀기 ({wrong.length})
              </button>
            )}
            <Link href={backHref} className="btn-secondary">
              처음으로
            </Link>
          </div>
        </div>
        <ResultList title="틀린 문항" items={wrong} answers={answers} subjectId={subjectId} isGuest={isGuest} tone="bad" />
        <ResultList title="헷갈림 체크한 문항" items={confused} answers={answers} subjectId={subjectId} isGuest={isGuest} tone="warn" />
      </section>
    );
  }

  const correctChoice = q.correct_choice !== null ? q.choices.find((c) => c.ord === q.correct_choice) : null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <Link href={backHref} className="btn-ghost btn-sm">
          ← 나가기
        </Link>
        <span>
          {idx + 1} / {questions.length}
          {sessionId && <span className="ml-1 text-xs text-muted">· 저장됨</span>}
        </span>
        <button
          className={`btn-sm rounded-full border px-3 ${flashcard ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          onClick={() => setFlashcard(!flashcard)}
        >
          플래시카드 {flashcard ? "ON" : "OFF"}
        </button>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full bg-accent transition-all" style={{ width: `${((idx + (answered ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>

      {flashcard ? (
        <div className="card min-h-[40vh] cursor-pointer select-none" onClick={() => setFlipped(!flipped)}>
          {!flipped ? (
            <>
              <div className="text-xs font-semibold text-muted">문제 · 탭하면 정답</div>
              <p className="mt-2 whitespace-pre-wrap text-xl font-semibold leading-relaxed">{q.prompt}</p>
              <ol className="mt-4 flex flex-col gap-1 text-base text-muted">
                {order.map((c, i) => (
                  <li key={c.id}>
                    {i + 1}. {c.text}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold text-ok">정답</div>
              {correctChoice ? (
                <p className="mt-2 text-xl font-semibold">{correctChoice.text}</p>
              ) : (
                <p className="mt-2 text-warn">정답이 아직 지정되지 않은 문항입니다.</p>
              )}
              {correctChoice?.explanation && <p className="mt-3 whitespace-pre-wrap text-base">{correctChoice.explanation}</p>}
              {q.hint && <p className="mt-3 text-sm text-muted">힌트: {q.hint}</p>}
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="whitespace-pre-wrap text-xl font-semibold leading-relaxed">{q.prompt}</p>
          {q.needs_review && <p className="mt-2 text-sm text-warn">정답이 지정되지 않은 문항입니다. 선택은 기록되지만 채점되지 않습니다.</p>}
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
                  {answered && (showAll || isAns || picked) && c.explanation && (
                    <p className={`mt-1 whitespace-pre-wrap px-2 text-base ${isAns ? "text-ok" : picked ? "text-bad" : "text-muted"}`}>
                      {c.explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {answered && (
            <div className="mt-3 flex flex-col gap-2">
              <div className={`text-lg font-bold ${a?.isCorrect ? "text-ok" : a?.isCorrect === false ? "text-bad" : "text-warn"}`}>
                {a?.isCorrect ? "정답!" : a?.isCorrect === false ? "오답" : "채점 불가"}
              </div>
              {q.choices.some((c) => c.explanation) && (
                <button className="btn-ghost btn-sm self-start" onClick={() => setShowAll(!showAll)}>
                  {showAll ? "선지별 해설 접기" : "선지별 해설 모두 보기"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {q.hint && !flashcard && (
          <button className="btn-secondary btn-sm" onClick={() => setShowHint(!showHint)}>
            힌트 {showHint ? "숨기기" : "보기"}
          </button>
        )}
        <button
          className={`btn-sm rounded-xl border px-3 py-2 font-semibold ${a?.confused ? "border-warn bg-warn-soft text-warn" : "border-border"}`}
          onClick={toggleConfused}
        >
          {a?.confused ? "✓ 헷갈림" : "헷갈림 체크"}
        </button>
        <div className="ml-auto flex gap-2">
          {idx > 0 && (
            <button className="btn-secondary btn-sm" onClick={() => goTo(idx - 1)}>
              이전
            </button>
          )}
          {(answered || flashcard) && (
            <button className="btn-primary" onClick={goNext}>
              {idx + 1 >= questions.length ? "결과 보기" : "다음"}
            </button>
          )}
        </div>
      </div>
      {showHint && q.hint && <p className="card whitespace-pre-wrap text-base">{q.hint}</p>}
    </section>
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
              {picked && ans?.isCorrect === false && <p className="mt-1 text-sm text-bad">내 답: {picked.text}</p>}
              {correct && <p className="mt-1 text-sm text-ok">정답: {correct.text}</p>}
              {correct?.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{correct.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
