"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuestionWithChoices, Subject } from "@/domains/shared/types";
import type { GroupStat, SavedItem, WeakSummary } from "@/domains/progress/queries";
import { dismissQuestionAction } from "@/domains/progress/actions";
import { AddToCollection } from "@/domains/quiz/components/AddToCollection";

type Filter = "all" | "wrong" | "confused" | "saved";

export function WeakView({ subject, summary, questions }: { subject: Subject; summary: WeakSummary; questions: QuestionWithChoices[] }) {
  const [tab, setTab] = useState<"list" | "stats">("list");
  const [filter, setFilter] = useState<Filter>("all");
  const byId = new Map(questions.map((q) => [q.id, q]));
  const items = summary.items.filter((it) => filter === "all" || it.reasons.includes(filter)).filter((it) => byId.has(it.questionId));
  const counts = {
    all: summary.items.length,
    wrong: summary.items.filter((i) => i.reasons.includes("wrong")).length,
    confused: summary.items.filter((i) => i.reasons.includes("confused")).length,
    saved: summary.items.filter((i) => i.reasons.includes("saved")).length,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-3">
        <div>
          <div className="text-sm text-muted">푼 문항 {summary.totalAttempts}개</div>
          <div className="text-2xl font-bold">{Math.round(summary.accuracy * 100)}% 정답</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/quiz?subject=${subject.id}&mode=saved&count=all&order=random`} className="btn-secondary btn-sm">
            저장된 문제 풀기 ({counts.all})
          </Link>
          <Link href={`/quiz?subject=${subject.id}&mode=weakmix&count=20`} className="btn-primary btn-sm">
            약점 섞어 풀기 (20)
          </Link>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-card p-1">
        {(
          [
            ["list", `저장된 문제 ${counts.all}`],
            ["stats", "통계"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === k ? "bg-accent text-white" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "list" && (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "전체"],
                ["wrong", "틀림"],
                ["confused", "헷갈림"],
                ["saved", "직접 저장"],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full border px-3 py-1 text-sm ${filter === k ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
              >
                {label} {counts[k]}
              </button>
            ))}
          </div>
          <SavedList subjectId={subject.id} items={items} byId={byId} />
        </>
      )}
      {tab === "stats" && (
        <div className="flex flex-col gap-4">
          <StatTable title="단원별" rows={summary.byUnit} />
          <StatTable title="세트별" rows={summary.bySet} />
          <StatTable title="태그별" rows={summary.byTag} />
        </div>
      )}
    </div>
  );
}

function SavedList({ subjectId, items, byId }: { subjectId: string; items: SavedItem[]; byId: Map<string, QuestionWithChoices> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  if (items.length === 0) {
    return <p className="card text-muted">저장된 문제가 없습니다. 틀리거나 헷갈림 체크한 문제는 자동으로 들어오고, 퀴즈 중 &quot;저장&quot;으로 직접 넣을 수도 있습니다.</p>;
  }
  const remove = (qid: string) => {
    setRemoving(qid);
    startTransition(async () => {
      await dismissQuestionAction(qid);
      setRemoving(null);
      router.refresh();
    });
  };
  const ids = items.map((i) => i.questionId);
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-muted">{items.length}문항</span>
        <div className="flex gap-2">
          <AddToCollection subjectId={subjectId} questionIds={ids} />
          <Link href={`/quiz?ids=${ids.join(",")}`} className="btn-primary btn-sm">
            이 목록 풀기
          </Link>
        </div>
      </div>
      <ol className="flex flex-col gap-3">
        {items.map((it, i) => {
          const q = byId.get(it.questionId)!;
          const correct = q.choices.find((c) => c.ord === q.correct_choice);
          return (
            <li key={q.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  {i + 1}. {q.prompt}
                </p>
                <button className="btn-ghost btn-sm shrink-0 text-bad" disabled={pending && removing === q.id} onClick={() => remove(q.id)}>
                  {removing === q.id ? "빼는 중…" : "빼기"}
                </button>
              </div>
              <p className="mt-1 flex flex-wrap gap-2 text-xs">
                {it.wrongCount > 0 && <span className="badge bg-bad-soft text-bad">{it.wrongCount}회 틀림</span>}
                {it.confused && <span className="badge bg-warn-soft text-warn">헷갈림</span>}
                {it.saved && <span className="badge bg-accent-soft text-accent">직접 저장</span>}
                {it.lastResult !== null && (
                  <span className={`badge ${it.lastResult ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>최근 {it.lastResult ? "정답" : "오답"}</span>
                )}
              </p>
              {correct && <p className="mt-1 text-sm text-ok">정답: {correct.text}</p>}
              {correct?.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{correct.explanation}</p>}
              {q.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{q.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StatTable({ title, rows }: { title: string; rows: GroupStat[] }) {
  return (
    <div className="card">
      <h3 className="mb-2 font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">아직 기록이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate sm:w-56">{r.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                <div className={`h-full ${r.accuracy < 0.7 ? "bg-bad" : "bg-ok"}`} style={{ width: `${r.accuracy * 100}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right text-muted">
                {r.correct}/{r.total} ({Math.round(r.accuracy * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
