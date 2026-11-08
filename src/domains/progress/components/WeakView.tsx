"use client";
import Link from "next/link";
import { useState } from "react";
import type { QuestionWithChoices, Subject } from "@/domains/shared/types";
import type { GroupStat, WeakSummary } from "@/domains/progress/queries";
import { AddToCollection } from "@/domains/quiz/components/AddToCollection";

export function WeakView({ subject, summary, questions }: { subject: Subject; summary: WeakSummary; questions: QuestionWithChoices[] }) {
  const [tab, setTab] = useState<"wrong" | "confused" | "stats">("wrong");
  const wrongSet = new Set(summary.wrongIds);
  const confusedSet = new Set(summary.confusedIds);
  const wrong = questions.filter((q) => wrongSet.has(q.id));
  const confused = questions.filter((q) => confusedSet.has(q.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-3">
        <div>
          <div className="text-sm text-muted">푼 문항 {summary.totalAttempts}개</div>
          <div className="text-2xl font-bold">{Math.round(summary.accuracy * 100)}% 정답</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/quiz?subject=${subject.id}&mode=wrong&count=all&order=random`} className="btn-secondary btn-sm">
            틀린 문제 다시 풀기
          </Link>
          <Link href={`/quiz?subject=${subject.id}&mode=weakmix&count=20`} className="btn-primary btn-sm">
            약점 섞어 풀기 (20)
          </Link>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-card p-1">
        {(
          [
            ["wrong", `틀림 ${wrong.length}`],
            ["confused", `헷갈림 ${confused.length}`],
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

      {tab !== "stats" && <QuestionList subjectId={subject.id} items={tab === "wrong" ? wrong : confused} mode={tab} />}
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

function QuestionList({ subjectId, items, mode }: { subjectId: string; items: QuestionWithChoices[]; mode: "wrong" | "confused" }) {
  if (items.length === 0) return <p className="card text-muted">{mode === "wrong" ? "틀린 문항이 없습니다." : "헷갈림 체크한 문항이 없습니다."}</p>;
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-muted">{items.length}문항</span>
        <div className="flex gap-2">
          <AddToCollection subjectId={subjectId} questionIds={items.map((q) => q.id)} />
          <Link href={`/quiz?ids=${items.map((q) => q.id).join(",")}`} className="btn-primary btn-sm">
            다시 풀기
          </Link>
        </div>
      </div>
      <ol className="flex flex-col gap-3">
        {items.map((q, i) => {
          const correct = q.choices.find((c) => c.ord === q.correct_choice);
          return (
            <li key={q.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <p className="font-semibold">
                {i + 1}. {q.prompt}
              </p>
              {correct && <p className="mt-1 text-sm text-ok">정답: {correct.text}</p>}
              {correct?.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{correct.explanation}</p>}
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
