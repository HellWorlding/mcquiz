"use client";
import { cleanExplanation } from "@/domains/shared/labels";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuestionWithChoices, Subject, Unit } from "@/domains/shared/types";
import type { GroupStat, SavedItem, WeakSummary } from "@/domains/progress/queries";
import { dismissQuestionAction } from "@/domains/progress/actions";
import { AddToCollection } from "@/domains/quiz/components/AddToCollection";
import { QuestionBadges, SourceQuote } from "@/domains/shared/components/QuestionMeta";
import { EvidencePanel } from "@/domains/evidence/components/EvidencePanel";

type Filter = "all" | "wrong" | "confused" | "saved";

/** 단원 라벨: "1강 학교 경영" */
export function unitLabelOf(units: Unit[], unitId: string | null): { key: string; label: string; sort: number } {
  const u = units.find((x) => x.id === unitId);
  if (!u) return { key: "__none__", label: "단원 미지정", sort: 99999 };
  return { key: u.id, label: u.no !== null ? `${u.no}강 ${u.title}` : u.title, sort: u.no ?? u.sort };
}

/** 문항 번호 라벨: "1강 7번" */
export function questionNoLabel(units: Unit[], q: { unit_id: string | null; ord: number }): string {
  const u = units.find((x) => x.id === q.unit_id);
  return u && u.no !== null ? `${u.no}강 ${q.ord}번` : `${q.ord}번`;
}

export function WeakView({ subject, summary, questions, units }: { subject: Subject; summary: WeakSummary; questions: QuestionWithChoices[]; units: Unit[] }) {
  const [tab, setTab] = useState<"list" | "stats">("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [unitFilter, setUnitFilter] = useState<string | null>(null); // null = 전체
  const byId = new Map(questions.map((q) => [q.id, q]));
  const byReason = summary.items.filter((it) => filter === "all" || it.reasons.includes(filter)).filter((it) => byId.has(it.questionId));
  // 단원별 묶음 (단원 순 → 문항 번호 순)
  const groups = new Map<string, { label: string; sort: number; items: SavedItem[] }>();
  for (const it of byReason) {
    const q = byId.get(it.questionId)!;
    const u = unitLabelOf(units, q.unit_id);
    const g = groups.get(u.key) ?? { label: u.label, sort: u.sort, items: [] };
    g.items.push(it);
    groups.set(u.key, g);
  }
  const groupList = [...groups.entries()]
    .map(([key, g]) => ({ key, ...g, items: [...g.items].sort((a, b) => byId.get(a.questionId)!.ord - byId.get(b.questionId)!.ord) }))
    .sort((a, b) => a.sort - b.sort);
  const visibleGroups = unitFilter ? groupList.filter((g) => g.key === unitFilter) : groupList;
  const items = visibleGroups.flatMap((g) => g.items);
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
          {groupList.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-xl bg-card p-2">
              <span className="w-full text-xs font-semibold text-muted">단원</span>
              <button
                onClick={() => setUnitFilter(null)}
                className={`rounded-full border px-3 py-1 text-sm ${unitFilter === null ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
              >
                전체 보기 {byReason.length}
              </button>
              {groupList.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setUnitFilter(g.key)}
                  className={`rounded-full border px-3 py-1 text-sm ${unitFilter === g.key ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                >
                  {g.label} {g.items.length}
                </button>
              ))}
            </div>
          )}
          <SavedList subjectId={subject.id} items={items} groups={visibleGroups} byId={byId} units={units} />
        </>
      )}
      {tab === "stats" && (
        <div className="flex flex-col gap-4">
          <StatTable title="단원별" rows={summary.byUnit} />
          <StatTable title="세부 주제별" rows={summary.byTopic} />
          <StatTable title="난이도별" rows={summary.byDifficulty} />
          <StatTable title="함정 유형별 (틀린 문항의 함정)" rows={summary.byTrap} />
          <StatTable title="세트별" rows={summary.bySet} />
          <StatTable title="태그별" rows={summary.byTag} />
        </div>
      )}
    </div>
  );
}

function SavedList({
  subjectId,
  items,
  groups,
  byId,
  units,
}: {
  subjectId: string;
  items: SavedItem[];
  groups: { key: string; label: string; items: SavedItem[] }[];
  byId: Map<string, QuestionWithChoices>;
  units: Unit[];
}) {
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
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-2 flex items-center gap-2 border-b border-border pb-1 font-bold">
              {g.label}
              <span className="text-sm font-normal text-muted">{g.items.length}문항</span>
            </h3>
            <ol className="flex flex-col gap-3">
        {g.items.map((it) => {
          const q = byId.get(it.questionId)!;
          const correct = q.choices.find((c) => c.ord === q.correct_choice);
          return (
            <li key={q.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  <span className="mr-1 text-accent">{questionNoLabel(units, q)}</span>
                  {q.prompt}
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
              {correct?.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{cleanExplanation(correct.explanation)}</p>}
              {q.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{q.explanation}</p>}
              <SourceQuote q={q} className="mt-1" />
              <div className="mt-1">
                <QuestionBadges q={q} />
              </div>
              <div className="mt-2">
                <EvidencePanel questionId={q.id} subjectId={subjectId} />
              </div>
            </li>
          );
        })}
            </ol>
          </section>
        ))}
      </div>
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
              <span className="w-28 shrink-0 text-right text-muted">
                {r.correct}/{r.total} ({Math.round(r.accuracy * 100)}%)
                {r.weak > 0 && <span className="ml-1 text-bad">약점 {r.weak}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
