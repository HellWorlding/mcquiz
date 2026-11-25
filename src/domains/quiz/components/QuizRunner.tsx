"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Choice, QuestionWithChoices } from "@/domains/shared/types";
import { hashString, shuffled } from "@/domains/quiz/shuffle";
import { recordAttemptAction, saveProgressAction, setConfusedAction, type SessionAnswer } from "@/domains/quiz/actions";
import type { ResumeState } from "@/domains/quiz/resolve";
import { dismissQuestionsAction, saveQuestionAction, undismissQuestionsAction } from "@/domains/progress/actions";
import { QuestionBadges, SourceQuote } from "@/domains/shared/components/QuestionMeta";
import { EvidencePanel } from "@/domains/evidence/components/EvidencePanel";
import { cleanExplanation } from "@/domains/shared/labels";
import { NoteBox } from "@/domains/notes/components/NoteBox";
import { useT } from "@/domains/shared/i18n-client";
import { ReportButton } from "@/domains/questions/components/ReportModal";
import { ChatDock } from "@/domains/evidence/components/ChatDock";

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
  /** 이미 저장함에 직접 넣어 둔 문항 */
  savedIds?: string[];
  /** unit_id → "3강 - 학교 경영" 같은 단원 라벨 */
  unitLabels?: Record<string, string>;
};

// 문항별 스톱워치(0초부터 올라간다). 모의고사(제한 시간) 모드는 나중에 이 값 위에 얹는다
const TIMER_KEY = "mcquiz.stopwatch";
const TIMER_CAP = 600; // 10분 넘으면 "10분+" 로 멈춘다. 합계도 문항마다 10분으로 잘라 더한다

const STRIKE_KEY = "mcquiz.strike"; // 선지 지우기 모드 (기본 꺼짐)

// 화면 설정은 기기에 기억한다 (localStorage). 같은 탭에서 바꾸면 storage 이벤트를 직접 쏴서 갱신한다
const subscribePref = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readPref = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "on";
  } catch {
    return fallback;
  }
};
const writePref = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "on" : "off");
    window.dispatchEvent(new Event("storage"));
  } catch {
    // 저장소를 못 쓰면 바꾸지 못한다
  }
};
const readTimerPref = () => readPref(TIMER_KEY, true);
const readStrikePref = () => readPref(STRIKE_KEY, false);

/** 누적 시간: "12:34" 또는 "1:02:03" */
function formatTotal(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "1:05" / "5분+" */
function formatElapsed(sec: number, cap: string): string {
  if (sec >= TIMER_CAP) return cap;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

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

export function QuizRunner({ questions: initial, title, subjectId, isGuest, isAdmin = false, backHref, seed, resume, notes = {}, savedIds: initialSaved = [], unitLabels = {} }: Props) {
  const t = useT();
  const [questions, setQuestions] = useState(initial);
  const [idx, setIdx] = useState(resume?.position ?? 0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const out: Record<string, Answer> = {};
    for (const [qid, a] of Object.entries(resume?.answers ?? {})) out[qid] = { ...a, attemptId: null };
    return out;
  });
  const [sessionId, setSessionId] = useState<string | null>(resume?.id ?? null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(initialSaved));
  // 결과 화면 "다시 볼 문항" 필터
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  // 결과 화면에서 저장함에서 뺀 문항. 목록에서 사라지고, 되돌리기로 복구할 수 있다
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [dismissBusy, setDismissBusy] = useState(false);
  // 선지 지우기(소거법): "문항id:선지ord" 집합. 화면 상태만, 저장하지 않는다
  const [struck, setStruck] = useState<Set<string>>(new Set());
  const toggleStrike = (qid: string, ord: number) => {
    const k = `${qid}:${ord}`;
    setStruck((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };
  // 문항별 타이머(초). 답을 고르면 멈추고, 5분이 넘으면 "5분+" 로 멈춘다. 숨기기는 기기에 기억
  const [elapsed, setElapsed] = useState<Record<string, number>>(() => {
    // 이어서 풀기: 세션에 저장해 둔 문항별 시간을 되살린다
    const out: Record<string, number> = {};
    for (const [qid, a] of Object.entries(resume?.answers ?? {})) if (a.elapsedSec) out[qid] = Math.min(TIMER_CAP, a.elapsedSec);
    return out;
  });
  const elapsedRef = useRef(elapsed);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);
  const timerOn = useSyncExternalStore(subscribePref, readTimerPref, () => true);
  const toggleTimer = () => writePref(TIMER_KEY, !timerOn);
  // 선지 지우기 모드: 켜면 선지 왼쪽에 × 칸이 생긴다
  const strikeOn = useSyncExternalStore(subscribePref, readStrikePref, () => false);
  const toggleStrikeMode = () => writePref(STRIKE_KEY, !strikeOn);
  // 우하단 AI 채팅 모달. 결과 화면에서는 고른 문항(chatTarget)으로 연다
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<QuestionWithChoices | null>(null);
  const askAbout = (x: QuestionWithChoices) => {
    setChatTarget(x);
    setChatOpen(true);
  };
  /** 저장함 토글 (풀이 화면·결과 화면 공용) */
  const toggleSave = (id: string) => {
    const next = !savedIds.has(id);
    setSavedIds((s) => {
      const n = new Set(s);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
    saveQuestionAction(id, next).catch(() => setSyncError(true));
  };
  /** 결과 화면: 저장함에서 빼기 (틀림·헷갈림·저장 표시를 지금 시점 이전 것으로 묻는다) */
  const dismissMany = (ids: string[]) => {
    if (ids.length === 0 || dismissBusy) return;
    setDismissBusy(true);
    dismissQuestionsAction(ids)
      .then((r) => {
        if (r.ok) setDismissed((s) => new Set([...s, ...ids]));
        else setSyncError(true);
      })
      .catch(() => setSyncError(true))
      .finally(() => setDismissBusy(false));
  };
  const undoDismiss = () => {
    const ids = [...dismissed];
    if (ids.length === 0 || dismissBusy) return;
    setDismissBusy(true);
    undismissQuestionsAction(ids)
      .then((r) => {
        if (r.ok) setDismissed(new Set());
        else setSyncError(true);
      })
      .catch(() => setSyncError(true))
      .finally(() => setDismissBusy(false));
  };
  const sessionRef = useRef<string | null>(resume?.id ?? null);
  const saving = useRef<Promise<void> | null>(null);
  // 서버 저장 실패(대개 새 버전 배포 직후 옛 화면이 서버를 부른 경우). 화면은 깨뜨리지 않고 안내만 띄운다
  const [syncError, setSyncError] = useState(false);

  /** 진행 상태를 DB 에 저장 (게스트는 건너뜀). 호출 순서를 지키려고 직렬화한다. */
  const persist = useCallback(
    (qs: QuestionWithChoices[], pos: number, ans: Record<string, Answer>, finished: boolean) => {
      if (isGuest) return;
      const compact: Record<string, SessionAnswer> = {};
      const times = elapsedRef.current;
      for (const [qid, a] of Object.entries(ans)) compact[qid] = { selectedOrd: a.selectedOrd, isCorrect: a.isCorrect, confused: a.confused, elapsedSec: times[qid] ?? 0 };
      // 아직 답하지 않았지만 시간이 쌓인 문항도 시간만 저장해 둔다 (이어서 풀 때 전체 시간 보존)
      for (const [qid, sec] of Object.entries(times)) if (!(qid in compact) && sec > 0) compact[qid] = { selectedOrd: null, isCorrect: null, confused: false, elapsedSec: sec };
      const run = async () => {
        let r: Awaited<ReturnType<typeof saveProgressAction>>;
        try {
          r = await saveProgressAction({
            sessionId: sessionRef.current,
            subjectId,
            title,
            questionIds: qs.map((q) => q.id),
            position: pos,
            answers: compact,
            finished,
          });
        } catch {
          setSyncError(true);
          return;
        }
        if (!r.ok) setSyncError(true);
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
  const qid = q?.id ?? null;
  const capped = qid ? (elapsed[qid] ?? 0) >= TIMER_CAP : true;
  useEffect(() => {
    if (!qid || answered || finished || capped) return;
    const id = setInterval(() => setElapsed((e) => ({ ...e, [qid]: Math.min(TIMER_CAP, (e[qid] ?? 0) + 1) })), 1000);
    return () => clearInterval(id);
  }, [qid, answered, finished, capped]);
  // 답하기 전의 시간도 잃지 않게: 30초마다, 그리고 탭을 숨기거나 닫을 때 세션에 저장한다
  const latest = useRef({ questions, idx, answers, finished });
  useEffect(() => {
    latest.current = { questions, idx, answers, finished };
  }, [questions, idx, answers, finished]);
  const tick30 = !!qid && !answered && (elapsed[qid] ?? 0) > 0 && (elapsed[qid] ?? 0) % 30 === 0;
  useEffect(() => {
    if (!tick30 || isGuest) return;
    const l = latest.current;
    if (!l.finished) persist(l.questions, l.idx, l.answers, false);
  }, [tick30, isGuest, persist]);
  useEffect(() => {
    if (isGuest) return;
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      const l = latest.current;
      if (!l.finished && (Object.keys(elapsedRef.current).length > 0 || Object.keys(l.answers).length > 0)) persist(l.questions, l.idx, l.answers, false);
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [isGuest, persist]);

  const goTo = (i: number) => {
    setShowHint(false);
    setShowAll(false);
    setChatOpen(false); // 문항이 바뀌면 채팅은 접고 새 문항 맥락으로 다시 시작
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
      try {
        const r = await recordAttemptAction({ questionId: q.id, selectedOrd: choice.ord, isCorrect, confused, elapsedSec: elapsed[q.id] ?? 0 });
        if (r.ok && r.data) setAnswers((s) => ({ ...s, [q.id]: { ...s[q.id], attemptId: r.data } }));
        else if (!r.ok) setSyncError(true);
      } catch {
        setSyncError(true);
      }
    },
    [q, answered, answers, isGuest, persist, questions, idx, elapsed],
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
    try {
      if (cur?.attemptId) {
        await setConfusedAction(cur.attemptId, next);
      } else {
        const r = await recordAttemptAction({ questionId: q.id, selectedOrd: null, isCorrect: null, confused: next });
        if (r.ok && r.data) setAnswers((s) => ({ ...s, [q.id]: { ...s[q.id], attemptId: r.data } }));
      }
    } catch {
      setSyncError(true);
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
    // 다시 볼 문항: 틀림·헷갈림·저장 중 하나라도 해당하면 한 번만 나온다 (이유는 배지로)
    const review = questions.filter((x) => !dismissed.has(x.id) && (answers[x.id]?.isCorrect === false || answers[x.id]?.confused || savedIds.has(x.id)));
    const totalPts = graded.reduce((s, x) => s + pts(x), 0);
    const gotPts = correct.reduce((s, x) => s + pts(x), 0);
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    // 총 소요 시간: 문항마다 상한(10분)으로 자른 값을 더한다
    const totalSec = questions.reduce((s, x) => s + Math.min(TIMER_CAP, elapsed[x.id] ?? 0), 0);
    return (
      <section className="flex flex-col gap-4 pb-20">
        <div className="card text-center">
          <div className="text-sm text-muted">{title}</div>
          <div className="mt-1 text-4xl font-bold">{t("quiz.score_pts", { got: fmt(gotPts), total: fmt(totalPts) })}</div>
          <div className="mt-1 text-muted">
            {t("quiz.score_count", { correct: correct.length, total: graded.length, pct: totalPts ? Math.round((gotPts / totalPts) * 100) : 0 })}
          </div>
          {timerOn && totalSec > 0 && <div className="mt-1 font-mono text-sm tabular-nums text-muted">⏱ {t("quiz.total_time", { t: formatTotal(totalSec) })}</div>}
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
        <ReviewList
          items={review}
          counts={{
            all: review.length,
            wrong: wrong.filter((x) => !dismissed.has(x.id)).length,
            confused: confused.filter((x) => !dismissed.has(x.id)).length,
            saved: review.filter((x) => savedIds.has(x.id)).length,
          }}
          filter={reviewFilter}
          onFilter={setReviewFilter}
          answers={answers}
          subjectId={subjectId}
          isGuest={isGuest}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          onAsk={askAbout}
          elapsed={timerOn ? elapsed : null}
          onDismiss={dismissMany}
          dismissedCount={dismissed.size}
          onUndoDismiss={undoDismiss}
          busy={dismissBusy}
        />
        {!isGuest && subjectId && chatTarget && (
          <ChatDock key={chatTarget.id} subjectId={subjectId} subjectName={title} question={chatTarget} revealed open={chatOpen} onOpenChange={setChatOpen} />
        )}
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

  // 전체 누적: 문항마다 상한으로 자른 값의 합
  const runningTotal = Object.values(elapsed).reduce((s, v) => s + Math.min(TIMER_CAP, v), 0);
  const timerChip = timerOn ? (
    <button
      type="button"
      onClick={toggleTimer}
      title={t("quiz.timer_hide")}
      className={`rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums ${answered ? "text-muted" : "bg-card text-foreground"}`}
    >
      ⏱ {formatElapsed(elapsed[q.id] ?? 0, t("quiz.timer_cap"))}
      <span className="ml-1.5 text-muted">
        · {t("quiz.timer_total")} {formatTotal(runningTotal)}
      </span>
    </button>
  ) : (
    <button type="button" onClick={toggleTimer} title={t("quiz.timer_show")} className="rounded-md px-1.5 py-0.5 text-xs text-muted opacity-50 hover:opacity-100">
      ⏱
    </button>
  );
  const unitTitle = q.unit_id ? unitLabels[q.unit_id] : null;

  return (
    <div className="flex flex-col gap-3 pb-20 lg:flex-row lg:items-start">
    <section className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <Link href={backHref} className="btn-ghost btn-sm">
          {t("quiz.exit")}
        </Link>
        <span>
          {idx + 1} / {questions.length}
          {sessionId && <span className="ml-1 text-xs text-muted">{t("quiz.saved_badge")}</span>}
        </span>
        <span className="flex justify-end">{timerChip}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full bg-accent transition-all" style={{ width: `${((idx + (answered ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>
      {syncError && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          <span className="flex-1">{t("quiz.sync_error")}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => window.location.reload()}>
            {t("quiz.sync_reload")}
          </button>
        </div>
      )}

      {(
        <div className="card">
          {unitTitle && <div className="mb-1 truncate text-xs text-muted">{unitTitle}</div>}
          <QuestionBadges q={{ ...q, topic: answered ? q.topic : null }} showTraps={false} />
          <p className="mt-1 whitespace-pre-wrap text-xl font-semibold leading-relaxed">{q.prompt}</p>
          {q.needs_review && <p className="mt-2 text-sm text-warn">{t("quiz.no_answer_warn")}</p>}
          <ul className="mt-4 flex flex-col gap-2">
            {order.map((c, i) => {
              const picked = a?.selectedOrd === c.ord;
              const isAns = q.correct_choice !== null && c.ord === q.correct_choice;
              // 지운 선지는 모드를 꺼도 지워진 채로 둔다 (× 칸만 사라진다). 되살리려면 모드를 켜고 × 를 다시 누른다
              const out = !answered && struck.has(`${q.id}:${c.ord}`);
              let cls = "border-border bg-card";
              if (answered) {
                if (isAns) cls = "border-ok bg-ok-soft";
                else if (picked) cls = "border-bad bg-bad-soft";
                else cls = "border-border opacity-70";
              } else if (out) cls = "border-border bg-background text-muted line-through opacity-60";
              return (
                <li key={c.id} className="flex items-stretch gap-1.5">
                  {/* 지우기(소거) 칸: 선지 버튼과 겹치지 않게 왼쪽에 따로 둔다. 모바일에서도 항상 보인다 */}
                  {!answered && strikeOn && (
                    <button
                      type="button"
                      aria-label={out ? t("quiz.strike_undo") : t("quiz.strike")}
                      aria-pressed={out}
                      title={out ? t("quiz.strike_undo") : t("quiz.strike")}
                      onClick={() => toggleStrike(q.id, c.ord)}
                      className={`flex w-10 shrink-0 items-center justify-center rounded-xl border text-xl leading-none transition ${
                        out ? "border-bad bg-bad-soft font-bold text-bad" : "border-border text-muted opacity-40 hover:opacity-100 active:scale-95"
                      }`}
                    >
                      ×
                    </button>
                  )}
                  <button
                    onClick={() => select(c)}
                    disabled={answered || out}
                    className={`min-w-0 flex-1 rounded-xl border-2 px-4 py-3 text-left text-lg transition ${cls} ${!answered && !out ? "active:scale-[0.99] hover:border-accent" : ""}`}
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
              {!isGuest && <EvidencePanel questionId={q.id} subjectId={subjectId} isAdmin={isAdmin} showChat={false} />}
              {!isGuest && (
                <div className="flex flex-wrap items-start gap-2">
                  {/* 메모는 카드 너비를 다 쓰게 (필기 화면처럼 넓게) */}
                  <div className="min-w-0 flex-1 basis-[min(100%,26rem)]">
                    <NoteBox key={q.id} questionId={q.id} initial={notes[q.id] ?? ""} compact importText={explanationText(q)} />
                  </div>
                  <ReportButton questionId={q.id} />
                </div>
              )}
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
            onClick={() => toggleSave(q.id)}
          >
            {savedIds.has(q.id) ? t("quiz.saved") : t("quiz.save")}
          </button>
        )}
        <button
          type="button"
          aria-pressed={strikeOn}
          title={t("quiz.strike_mode_title")}
          className={`btn-sm rounded-xl border px-3 py-2 font-semibold ${strikeOn ? "border-bad bg-bad-soft text-bad" : "border-border"}`}
          onClick={toggleStrikeMode}
        >
          {strikeOn ? t("quiz.strike_mode_on") : t("quiz.strike_mode")}
        </button>
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
    {!isGuest && subjectId && <ChatDock key={q.id} subjectId={subjectId} subjectName={title} question={q} revealed={answered} open={chatOpen} onOpenChange={setChatOpen} displayOrder={order.map((c) => c.ord)} />}
    </div>
  );
}

type ReviewFilter = "all" | "wrong" | "confused" | "saved";

/** 결과 화면: 틀림·헷갈림·저장 문항을 한 목록으로. 이유는 배지, 칩으로 거른다 */
function ReviewList({
  items,
  counts,
  filter,
  onFilter,
  answers,
  subjectId,
  isGuest,
  savedIds,
  onToggleSave,
  onAsk,
  elapsed,
  onDismiss,
  dismissedCount,
  onUndoDismiss,
  busy,
}: {
  items: QuestionWithChoices[];
  counts: Record<ReviewFilter, number>;
  filter: ReviewFilter;
  onFilter: (f: ReviewFilter) => void;
  answers: Record<string, Answer>;
  subjectId: string | null;
  isGuest: boolean;
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  onAsk: (q: QuestionWithChoices) => void;
  /** 문항별 소요 시간(초). 스톱워치를 숨겼으면 null */
  elapsed: Record<string, number> | null;
  /** 저장함에서 빼기 (한 개 또는 여러 개) */
  onDismiss: (ids: string[]) => void;
  dismissedCount: number;
  onUndoDismiss: () => void;
  busy: boolean;
}) {
  const t = useT();
  // 여러 개 고르기 → 한 번에 빼기
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const undoLine = dismissedCount > 0 && (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
      {t("quiz.dismissed_n", { n: dismissedCount })}
      <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onUndoDismiss}>
        {t("quiz.undo")}
      </button>
    </p>
  );
  if (items.length === 0) return undoLine ? <div className="card">{undoLine}</div> : null;
  const shown = items.filter((q) => {
    if (filter === "wrong") return answers[q.id]?.isCorrect === false;
    if (filter === "confused") return !!answers[q.id]?.confused;
    if (filter === "saved") return savedIds.has(q.id);
    return true;
  });
  const shownIds = shown.map((q) => q.id);
  const pickedVisible = shownIds.filter((id) => sel.has(id));
  const togglePick = (qid: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });
  const removePicked = () => {
    if (pickedVisible.length === 0) return;
    onDismiss(pickedVisible);
    setSel(new Set());
    setSelecting(false);
  };
  const chips: [ReviewFilter, string, string][] = [
    ["all", t("quiz.review_all"), "border-accent bg-accent-soft text-accent"],
    ["wrong", t("quiz.wrong_list"), "border-bad bg-bad-soft text-bad"],
    ["confused", t("quiz.confused_list"), "border-warn bg-warn-soft text-warn"],
    ["saved", t("quiz.saved_list"), "border-accent bg-accent-soft text-accent"],
  ];
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">
          {t("quiz.review_list")} ({items.length})
        </h2>
        {!isGuest && (
          <div className="flex flex-wrap items-center gap-2">
            {selecting ? (
              <>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setSel(pickedVisible.length === shownIds.length ? new Set() : new Set(shownIds))}>
                  {pickedVisible.length === shownIds.length ? t("saved.pick_none") : t("saved.pick_all")}
                </button>
                <button
                  type="button"
                  className="btn-sm rounded-xl bg-bad px-3 py-1.5 font-semibold text-white disabled:opacity-40"
                  disabled={busy || pickedVisible.length === 0}
                  onClick={removePicked}
                >
                  {busy ? t("saved.removing") : t("saved.remove_picked", { n: pickedVisible.length })}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setSelecting(false);
                    setSel(new Set());
                  }}
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <>
                {shown.length > 0 && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setSelecting(true)}>
                    {t("saved.pick_mode")}
                  </button>
                )}
                {subjectId && shown.length > 0 && <AddToCollection subjectId={subjectId} questionIds={shownIds} />}
              </>
            )}
          </div>
        )}
      </div>
      {undoLine}
      <div className="mt-2 flex flex-wrap gap-2">
        {chips.map(([k, label, active]) => (
          <button
            key={k}
            type="button"
            onClick={() => onFilter(k)}
            disabled={counts[k] === 0}
            className={`rounded-full border px-3 py-1 text-sm disabled:opacity-40 ${filter === k ? active : "border-border"}`}
          >
            {label} {counts[k]}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="mt-3 text-sm text-muted">{t("quiz.review_empty")}</p>}
      <ol className="mt-3 flex flex-col gap-3">
        {shown.map((q, i) => {
          const ans = answers[q.id];
          const correct = q.choices.find((c) => c.ord === q.correct_choice);
          const picked = q.choices.find((c) => c.ord === ans?.selectedOrd);
          return (
            <li key={q.id} className={`border-t border-border pt-3 first:border-t-0 first:pt-0 ${selecting ? "flex gap-2" : ""}`}>
              {selecting && (
                <label className="flex shrink-0 cursor-pointer items-start pt-0.5">
                  <input type="checkbox" className="h-5 w-5 accent-accent" checked={sel.has(q.id)} onChange={() => togglePick(q.id)} aria-label={t("saved.pick_one")} />
                </label>
              )}
              <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {i + 1}. {q.prompt}
              </p>
              <p className="mt-1 flex flex-wrap gap-1 text-xs">
                {ans?.isCorrect === false && <span className="badge bg-bad-soft text-bad">{t("quiz.wrong")}</span>}
                {ans?.isCorrect === true && <span className="badge bg-ok-soft text-ok">{t("quiz.review_correct")}</span>}
                {ans?.confused && <span className="badge bg-warn-soft text-warn">{t("saved.f_confused")}</span>}
                {savedIds.has(q.id) && <span className="badge bg-accent-soft text-accent">{t("saved.f_saved")}</span>}
                {elapsed && (elapsed[q.id] ?? 0) > 0 && (
                  <span className="badge bg-background font-mono tabular-nums text-muted">⏱ {formatElapsed(elapsed[q.id] ?? 0, t("quiz.timer_cap"))}</span>
                )}
              </p>
              {picked && ans?.isCorrect === false && <p className="mt-1 text-sm text-bad">{t("quiz.my_answer")}: {picked.text}</p>}
              {correct && <p className="mt-1 text-sm text-ok">{t("common.answer")}: {correct.text}</p>}
              {correct?.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{cleanExplanation(correct.explanation)}</p>}
              {q.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{q.explanation}</p>}
              <SourceQuote q={q} className="mt-1" />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <QuestionBadges q={q} />
                {!isGuest && (
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      className={`btn-sm rounded-xl border px-3 py-1.5 text-sm font-semibold ${savedIds.has(q.id) ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                      onClick={() => onToggleSave(q.id)}
                    >
                      {savedIds.has(q.id) ? t("quiz.saved") : t("quiz.save")}
                    </button>
                    {subjectId && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => onAsk(q)}>
                        {t("chat.fab")}
                      </button>
                    )}
                    {!selecting && (
                      <button type="button" className="btn-ghost btn-sm text-muted" title={t("quiz.dismiss_title")} disabled={busy} onClick={() => onDismiss([q.id])}>
                        {t("common.remove")}
                      </button>
                    )}
                  </span>
                )}
              </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
