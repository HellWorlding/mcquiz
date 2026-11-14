"use client";
import { cleanExplanation, unitLabel } from "@/domains/shared/labels";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuestionWithChoices, Subject, Unit } from "@/domains/shared/types";
import type { GroupStat, SavedItem, WeakSummary } from "@/domains/progress/queries";
import { dismissQuestionAction } from "@/domains/progress/actions";
import { AddToCollection } from "@/domains/quiz/components/AddToCollection";
import { QuestionBadges, SourceQuote } from "@/domains/shared/components/QuestionMeta";
import { EvidencePanel } from "@/domains/evidence/components/EvidencePanel";
import { useT } from "@/domains/shared/i18n-client";
import { isKoreanTitle, qNoLabel } from "@/domains/shared/labels";
import { ReportButton } from "@/domains/questions/components/ReportModal";

type Filter = "all" | "wrong" | "confused" | "saved";

/** 단원 라벨: "1강 학교 경영" / "파트3" */
export function unitLabelOf(units: Unit[], unitId: string | null): { key: string; label: string; sort: number; groupKey: string } {
  const u = units.find((x) => x.id === unitId);
  if (!u) return { key: "__none__", label: "단원 미지정", sort: 99999, groupKey: "__none__" };
  // 최상위 조상 = 대단원
  let top = u;
  while (top.parent_id) {
    const parent = units.find((x) => x.id === top.parent_id);
    if (!parent) break;
    top = parent;
  }
  const isLeafOfTree = top.id !== u.id;
  const label = isLeafOfTree ? (u.no !== null ? `${u.no}. ${u.title}` : u.title) : unitLabel(u.no, u.title);
  return { key: u.id, label, sort: u.no ?? u.sort, groupKey: isLeafOfTree ? top.id : "__top__" };
}

/** 문항 번호 라벨: "1강 7번" */
export function questionNoLabel(units: Unit[], q: { unit_id: string | null; ord: number }): string {
  const u = units.find((x) => x.id === q.unit_id);
  if (!u) return qNoLabel(q.ord, true);
  const korean = isKoreanTitle(u.title);
  if (!korean) return `${u.title} ${qNoLabel(q.ord, false)}`;
  return u.no !== null ? `${u.no}강 ${q.ord}번` : qNoLabel(q.ord, true);
}

export function WeakView({ subject, summary, questions, units }: { subject: Subject; summary: WeakSummary; questions: QuestionWithChoices[]; units: Unit[] }) {
  const t = useT();
  const [tab, setTab] = useState<"list" | "stats">("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [unitFilter, setUnitFilter] = useState<string | null>(null); // null = 전체
  const [groupFilter, setGroupFilter] = useState<string | null>(null); // 대단원 (콜로케이션/어휘). null = 전체
  const byId = new Map(questions.map((q) => [q.id, q]));
  const byReason = summary.items.filter((it) => filter === "all" || it.reasons.includes(filter)).filter((it) => byId.has(it.questionId));
  // 단원별 묶음 (단원 순 → 문항 번호 순)
  const groups = new Map<string, { label: string; sort: number; groupKey: string; items: SavedItem[] }>();
  for (const it of byReason) {
    const q = byId.get(it.questionId)!;
    const u = unitLabelOf(units, q.unit_id);
    const g = groups.get(u.key) ?? { label: u.label, sort: u.sort, groupKey: u.groupKey, items: [] };
    g.items.push(it);
    groups.set(u.key, g);
  }
  const allGroupList = [...groups.entries()]
    .map(([key, g]) => ({ key, ...g, items: [...g.items].sort((a, b) => byId.get(a.questionId)!.ord - byId.get(b.questionId)!.ord) }))
    .sort((a, b) => a.sort - b.sort);
  // 대단원(최상위 단원) 목록: 트리 구조인 주제에서만 보인다
  const topGroups = (() => {
    const m = new Map<string, { label: string; count: number; sort: number }>();
    for (const g of allGroupList) {
      if (g.groupKey === "__top__" || g.groupKey === "__none__") continue;
      const top = units.find((u) => u.id === g.groupKey);
      const cur = m.get(g.groupKey) ?? { label: top?.title ?? "", count: 0, sort: top?.no ?? top?.sort ?? 0 };
      cur.count += g.items.length;
      m.set(g.groupKey, cur);
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => a.sort - b.sort);
  })();
  const groupList = groupFilter ? allGroupList.filter((g) => g.groupKey === groupFilter) : allGroupList;
  const visibleGroups = unitFilter ? groupList.filter((g) => g.key === unitFilter) : groupList;
  const items = visibleGroups.flatMap((g) => g.items);
  // 상단 요약: 대단원을 골랐으면 그 대단원 기준
  const headStat = groupFilter ? summary.byGroup.find((g) => g.key === groupFilter) : null;
  const headTotal = headStat ? headStat.total : summary.totalAttempts;
  const headAcc = headStat ? headStat.accuracy : summary.accuracy;
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
          <div className="text-sm text-muted">
            {headStat ? `${headStat.label} · ` : ""}{t("saved.practiced", { n: headTotal })}
          </div>
          <div className="text-2xl font-bold">{t("saved.accuracy", { pct: Math.round(headAcc * 100) })}</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/quiz?subject=${subject.id}&mode=saved&count=all&order=random`} className="btn-secondary btn-sm">
            {t("saved.practice_saved", { n: counts.all })}
          </Link>
          <Link href={`/quiz?subject=${subject.id}&mode=weakmix&count=20`} className="btn-primary btn-sm">
            {t("saved.weak_mix")}
          </Link>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-card p-1">
        {(
          [
            ["list", t("saved.tab_list", { n: counts.all })],
            ["stats", t("saved.tab_stats")],
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
                ["all", t("saved.f_all")],
                ["wrong", t("saved.f_wrong")],
                ["confused", t("saved.f_confused")],
                ["saved", t("saved.f_saved")],
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
          {topGroups.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-xl bg-card p-2">
              <span className="w-full text-xs font-semibold text-muted">{t("saved.group")}</span>
              <button
                onClick={() => {
                  setGroupFilter(null);
                  setUnitFilter(null);
                }}
                className={`rounded-full border px-3 py-1 text-sm ${groupFilter === null ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
              >
                {t("common.all")} {byReason.length}
              </button>
              {topGroups.map((g) => (
                <button
                  key={g.key}
                  onClick={() => {
                    setGroupFilter(g.key);
                    setUnitFilter(null);
                  }}
                  className={`rounded-full border px-3 py-1 text-sm ${groupFilter === g.key ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                >
                  {g.label} {g.count}
                </button>
              ))}
            </div>
          )}
          {groupList.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-xl bg-card p-2">
              <span className="w-full text-xs font-semibold text-muted">{topGroups.length ? t("saved.subunit") : t("common.unit")}</span>
              <button
                onClick={() => setUnitFilter(null)}
                className={`rounded-full border px-3 py-1 text-sm ${unitFilter === null ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
              >
                {t("saved.all_units")} {groupList.reduce((n, g) => n + g.items.length, 0)}
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
          <StatTable title={t("saved.stat_group")} rows={summary.byGroup} />
          <StatTable title={t("saved.stat_unit")} rows={summary.byUnit} />
          <StatTable title={t("saved.stat_topic")} rows={summary.byTopic.filter((r) => r.weak > 0)} empty={t("saved.no_weak_topic")} />
          <StatTable title={t("saved.stat_difficulty")} rows={summary.byDifficulty} />
          <StatTable title={t("saved.stat_trap")} rows={summary.byTrap} />
          <StatTable title={t("saved.stat_set")} rows={summary.bySet} />
          <StatTable title={t("saved.stat_tag")} rows={summary.byTag} />
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
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  if (items.length === 0) {
    return <p className="card text-muted">{t("saved.empty")}</p>;
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
        <span className="text-sm text-muted">{t("common.count_questions", { n: items.length })}</span>
        <div className="flex gap-2">
          <AddToCollection subjectId={subjectId} questionIds={ids} />
          <Link href={`/quiz?ids=${ids.join(",")}`} className="btn-primary btn-sm">
            {t("saved.practice_list")}
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-2 flex items-center gap-2 border-b border-border pb-1 font-bold">
              {g.label}
              <span className="text-sm font-normal text-muted">{t("common.count_questions", { n: g.items.length })}</span>
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
                  {removing === q.id ? t("saved.removing") : t("common.remove")}
                </button>
              </div>
              <p className="mt-1 flex flex-wrap gap-2 text-xs">
                {it.wrongCount > 0 && <span className="badge bg-bad-soft text-bad">{t("saved.wrong_times", { n: it.wrongCount })}</span>}
                {it.confused && <span className="badge bg-warn-soft text-warn">{t("saved.f_confused")}</span>}
                {it.saved && <span className="badge bg-accent-soft text-accent">{t("saved.f_saved")}</span>}
                {it.lastResult !== null && (
                  <span className={`badge ${it.lastResult ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{it.lastResult ? t("saved.last_correct") : t("saved.last_wrong")}</span>
                )}
              </p>
              {correct && <p className="mt-1 text-sm text-ok">{t("common.answer")}: {correct.text}</p>}
              {correct?.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{cleanExplanation(correct.explanation)}</p>}
              {q.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{q.explanation}</p>}
              <SourceQuote q={q} className="mt-1" />
              <div className="mt-1">
                <QuestionBadges q={q} />
              </div>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <EvidencePanel questionId={q.id} subjectId={subjectId} />
                <ReportButton questionId={q.id} />
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

function StatTable({ title, rows, empty }: { title: string; rows: GroupStat[]; empty?: string }) {
  const t = useT();
  return (
    <div className="card">
      <h3 className="mb-2 font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty ?? t("saved.no_stats")}</p>
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
                {r.weak > 0 && <span className="ml-1 text-bad">{t("saved.weak", { n: r.weak })}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
