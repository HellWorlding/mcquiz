"use client";
import { cleanExplanation, unitLabel } from "@/shared/labels";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GroupStat, LearningUnit as Unit, QuizQuestion as QuestionWithChoices, SavedBoxSummary as WeakSummary, SavedItem, UnitRoundScores } from "../../domain/types";
import { dismissQuestionAction, dismissQuestionsAction, exportSavedAction } from "../actions";
import { AddToCollection } from "./AddToCollection";
import { QuestionBadges, SourceQuote } from "@/shared/ui/QuestionMeta";
import { EvidencePanel } from "@/contexts/knowledge";
import { useT } from "@/shared/i18n/client";
import { isKoreanTitle, qNoLabel } from "@/shared/labels";
import { ReportButton } from "./ReportModal";

type Subject = { id: string; name: string };

type Filter = "wrong" | "repeat" | "confused" | "saved";

/** 한국 시간으로 "2026.11.20 21:42" */
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
function fmtKst(iso: string): string {
  const parts = Object.fromEntries(KST.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}
const FILTERS: Filter[] = ["wrong", "repeat", "confused", "saved"];

/** 필터 조건 하나. repeat = 2회 이상 틀린 문항 (회독을 거듭해도 다시 틀린 것) */
function matchesOne(it: SavedItem, f: Filter): boolean {
  if (f === "repeat") return it.wrongCount >= 2;
  return it.reasons.includes(f);
}
/** 고른 조건을 모두 만족해야 한다 (AND). 아무것도 안 골랐으면 전체 */
const matches = (it: SavedItem, fs: Set<Filter>) => [...fs].every((f) => matchesOne(it, f));

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
  // 제목에 번호가 이미 있으면("1.2 모델", "Unit 3: …") 다시 붙이지 않는다
  const numbered = /^(\d|(unit|part|set|day|lesson|chapter)\s*\d)/i.test(u.title.trim());
  const label = isLeafOfTree ? (u.no !== null && !numbered ? `${u.no}. ${u.title}` : u.title) : unitLabel(u.no, u.title);
  return { key: u.id, label, sort: u.no ?? u.sort, groupKey: isLeafOfTree ? top.id : "__top__" };
}

/** 문항 번호 라벨: "1강 7번" */
export function questionNoLabel(units: Unit[], q: { unit_id: string | null; ord: number }): string {
  const u = units.find((x) => x.id === q.unit_id);
  if (!u) return qNoLabel(q.ord, true);
  const korean = isKoreanTitle(u.title);
  if (!korean) return `${u.title} ${qNoLabel(q.ord, false)}`;
  if (/^\d/.test(u.title.trim())) return `${u.title} ${q.ord}번`; // "1.2 모델 3번"
  return u.no !== null ? `${u.no}강 ${q.ord}번` : qNoLabel(q.ord, true);
}

/** 저장함 화면 (옛 WeakView). 저장함 = 틀림 ∪ 헷갈림 ∪ 직접 저장 − 빼기 */
export function SavedBoxView({
  subject,
  summary,
  questions,
  units,
  roundScores,
}: {
  subject: Subject;
  summary: WeakSummary;
  questions: QuestionWithChoices[];
  units: Unit[];
  /** unit_id → 회독 i → { n: i번째 풀이를 한 문항 수, correct: 그중 정답 } */
  roundScores: UnitRoundScores;
}) {
  const t = useT();
  const [tab, setTab] = useState<"list" | "stats">("list");
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const toggleFilter = (f: Filter) =>
    setFilters((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });
  const [unitFilter, setUnitFilter] = useState<string | null>(null); // null = 전체
  const [groupFilter, setGroupFilter] = useState<string | null>(null); // 대단원 (콜로케이션/어휘). null = 전체
  const byId = new Map(questions.map((q) => [q.id, q]));
  const byReason = summary.items.filter((it) => matches(it, filters)).filter((it) => byId.has(it.questionId));
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
  // 회독별 점수: k회독 = 각 문항의 k번째 풀이. 분모는 k번 이상 푼 문항 수. 대단원을 골랐으면 그 아래 단원만 합산
  const roundRows = (() => {
    const inScope = new Set<string>();
    if (groupFilter) {
      const stack = [groupFilter];
      while (stack.length) {
        const id = stack.pop()!;
        inScope.add(id);
        for (const u of units) if (u.parent_id === id) stack.push(u.id);
      }
    }
    const acc = new Map<number, { n: number; correct: number }>();
    for (const [unitId, rounds] of Object.entries(roundScores)) {
      if (groupFilter && !inScope.has(unitId)) continue;
      for (const [k, v] of Object.entries(rounds)) {
        const cur = acc.get(+k) ?? { n: 0, correct: 0 };
        acc.set(+k, { n: cur.n + v.n, correct: cur.correct + v.correct });
      }
    }
    return [...acc.entries()]
      .filter(([, v]) => v.n > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => ({ round: k, n: v.n, correct: v.correct, pct: Math.round((v.correct / v.n) * 100) }));
  })();
  // 칩의 숫자: 그 조건을 (이미 고른 다른 조건과 함께) 켰을 때 남는 문항 수
  const countWith = (f: Filter) => {
    const fs = new Set(filters);
    fs.add(f);
    return summary.items.filter((i) => matches(i, fs)).length;
  };
  const counts: Record<"all" | Filter, number> = {
    all: summary.items.length,
    wrong: countWith("wrong"),
    repeat: countWith("repeat"),
    confused: countWith("confused"),
    saved: countWith("saved"),
  };
  const labelOf: Record<Filter, string> = { wrong: t("saved.f_wrong"), repeat: t("saved.f_repeat"), confused: t("saved.f_confused"), saved: t("saved.f_saved") };
  // 내보내기 파일에 적을 조건 설명: "틀림 + 2회 이상 틀림 · 3강 학교 경영"
  const filterLabel = (() => {
    const parts: string[] = [];
    if (filters.size) parts.push([...filters].map((f) => labelOf[f]).join(" + "));
    const g = groupFilter ? topGroups.find((x) => x.key === groupFilter)?.label : null;
    const u = unitFilter ? groupList.find((x) => x.key === unitFilter)?.label : null;
    if (g) parts.push(g);
    if (u) parts.push(u);
    return parts.length ? parts.join(" · ") : null;
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-sm text-muted">
            {headStat ? `${headStat.label} · ` : ""}
            {t("saved.practiced", { n: headTotal })}
          </div>
          {roundRows.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5" title={t("saved.round_hint")}>
              {roundRows.map((r) => (
                <span key={r.round} className={`badge text-sm ${r.pct >= 90 ? "bg-ok-soft text-ok" : r.pct >= 70 ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>
                  {t("start.round_done", { k: r.round, c: r.correct, n: r.n, pct: r.pct })}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-2xl font-bold">{t("saved.accuracy", { pct: Math.round(headAcc * 100) })}</div>
          )}
          {roundRows.length > 0 && (
            <div className="mt-1 text-xs text-muted">
              {t("saved.round_hint")} · {t("saved.accuracy_last", { pct: Math.round(headAcc * 100) })}
            </div>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/quiz?subject=${subject.id}&mode=saved&count=all&order=random`} className="btn-secondary btn-sm">
            {t("saved.practice_saved", { n: counts.all })}
          </Link>
          <Link href={`/quiz?subject=${subject.id}&mode=weakmix&count=20`} className="btn-primary btn-sm">
            {t("saved.weak_mix")}
          </Link>
        </div>
        {counts.all > 0 && <ExportBar subjectId={subject.id} questionIds={items.map((i) => i.questionId)} filterLabel={filterLabel} />}
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilters(new Set())}
              className={`rounded-full border px-3 py-1 text-sm ${filters.size === 0 ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
            >
              {t("saved.f_all")} {counts.all}
            </button>
            {FILTERS.map((k) => (
              <button
                key={k}
                onClick={() => toggleFilter(k)}
                aria-pressed={filters.has(k)}
                className={`rounded-full border px-3 py-1 text-sm ${filters.has(k) ? "border-accent bg-accent-soft text-accent" : k === "repeat" && counts.repeat > 0 ? "border-bad text-bad" : "border-border"}`}
              >
                {filters.has(k) ? "✓ " : ""}
                {labelOf[k]} {counts[k]}
              </button>
            ))}
            <span className="text-xs text-muted">{t("saved.f_multi_hint")}</span>
          </div>
          {filters.has("repeat") && <p className="text-xs text-muted">{t("saved.f_repeat_hint")}</p>}
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
          <p className="text-xs text-muted">{t("saved.stats_basis")}</p>
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

type ExportKind = "json" | "md";
/** 내보내기 공용 로직: 서버 액션으로 문자열을 받아 파일로 내려받는다 */
function useSavedExport(subjectId: string) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (kind: ExportKind, questionIds: string[], filterLabel: string | null) => {
    if (busy || questionIds.length === 0) return;
    setBusy(kind);
    setError(null);
    try {
      const r = await exportSavedAction(subjectId, questionIds, filterLabel);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const text = kind === "json" ? r.data.json : r.data.markdown;
      const blob = new Blob([text], { type: kind === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.data.fileBase}.${kind === "json" ? "json" : "md"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

/** 저장함을 JSON / Markdown 파일로 내려받기. 조건을 고르면 그 목록만, 아니면 이 주제의 저장함 전체 */
function ExportBar({ subjectId, questionIds, filterLabel }: { subjectId: string; questionIds: string[]; filterLabel: string | null }) {
  const t = useT();
  const { busy, error, run: runExport } = useSavedExport(subjectId);
  const run = (kind: ExportKind) => runExport(kind, questionIds, filterLabel);
  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-3" title={t("saved.export_title")}>
      <span className="text-sm font-semibold">{t("saved.export")}</span>
      <span className="text-xs text-muted">{filterLabel ? t("saved.export_scope", { f: filterLabel, n: questionIds.length }) : t("saved.export_scope_all", { n: questionIds.length })}</span>
      <div className="ml-auto flex gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={busy !== null} onClick={() => run("md")}>
          {busy === "md" ? t("saved.exporting") : t("saved.export_md")}
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={busy !== null} onClick={() => run("json")}>
          {busy === "json" ? t("saved.exporting") : t("saved.export_json")}
        </button>
      </div>
      <p className="w-full text-xs text-muted">{t("saved.export_title")}</p>
      {error && <p className="w-full text-xs text-bad">{t("saved.export_fail", { e: error })}</p>}
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
  // 여러 개 고르기 → 한 번에 빼기
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const exp = useSavedExport(subjectId);
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
  const togglePick = (qid: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });
  const pickedVisible = ids.filter((id) => picked.has(id));
  const removePicked = () => {
    if (pickedVisible.length === 0) return;
    startTransition(async () => {
      const r = await dismissQuestionsAction(pickedVisible);
      if (r.ok) {
        setPicked(new Set());
        setSelecting(false);
        router.refresh();
      }
    });
  };
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">{t("common.count_questions", { n: items.length })}</span>
        <div className="flex flex-wrap gap-2">
          {selecting ? (
            <>
              <button className="btn-secondary btn-sm" onClick={() => setPicked(pickedVisible.length === ids.length ? new Set() : new Set(ids))}>
                {pickedVisible.length === ids.length ? t("saved.pick_none") : t("saved.pick_all")}
              </button>
              <button
                className="btn-secondary btn-sm disabled:opacity-40"
                disabled={exp.busy !== null || pickedVisible.length === 0}
                onClick={() => exp.run("md", pickedVisible, t("saved.export_picked", { n: pickedVisible.length }))}
              >
                {exp.busy === "md" ? t("saved.exporting") : t("saved.export_picked_md")}
              </button>
              <button
                className="btn-secondary btn-sm disabled:opacity-40"
                disabled={exp.busy !== null || pickedVisible.length === 0}
                onClick={() => exp.run("json", pickedVisible, t("saved.export_picked", { n: pickedVisible.length }))}
              >
                {exp.busy === "json" ? t("saved.exporting") : t("saved.export_picked_json")}
              </button>
              <button className="btn-sm rounded-xl bg-bad px-3 py-1.5 font-semibold text-white disabled:opacity-40" disabled={pending || pickedVisible.length === 0} onClick={removePicked}>
                {pending ? t("saved.removing") : t("saved.remove_picked", { n: pickedVisible.length })}
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  setSelecting(false);
                  setPicked(new Set());
                }}
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary btn-sm" onClick={() => setSelecting(true)}>
                {t("saved.pick_mode")}
              </button>
              <AddToCollection subjectId={subjectId} questionIds={ids} />
              <Link href={`/quiz?ids=${ids.join(",")}`} className="btn-primary btn-sm">
                {t("saved.practice_list")}
              </Link>
            </>
          )}
        </div>
      </div>
      {exp.error && <p className="mb-2 text-xs text-bad">{t("saved.export_fail", { e: exp.error })}</p>}
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
            <li key={q.id} className={`border-t border-border pt-3 first:border-t-0 first:pt-0 ${selecting && picked.has(q.id) ? "-mx-2 rounded-lg bg-accent-soft/40 px-2" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                {selecting && (
                  <input
                    type="checkbox"
                    className="mt-1.5 h-5 w-5 shrink-0 accent-accent"
                    checked={picked.has(q.id)}
                    onChange={() => togglePick(q.id)}
                    aria-label={t("saved.pick_one")}
                  />
                )}
                <p className="flex-1 cursor-default font-semibold" onClick={selecting ? () => togglePick(q.id) : undefined}>
                  <span className="mr-1 text-accent">{questionNoLabel(units, q)}</span>
                  {q.prompt}
                </p>
                {!selecting && (
                  <button className="btn-ghost btn-sm shrink-0 text-bad" disabled={pending && removing === q.id} onClick={() => remove(q.id)}>
                    {removing === q.id ? t("saved.removing") : t("common.remove")}
                  </button>
                )}
              </div>
              <p className="mt-1 flex flex-wrap gap-2 text-xs">
                {it.wrongCount > 0 && <span className={`badge ${it.wrongCount >= 2 ? "bg-bad text-white" : "bg-bad-soft text-bad"}`}>{t("saved.wrong_times", { n: it.wrongCount })}</span>}
                {it.confused && <span className="badge bg-warn-soft text-warn">{t("saved.f_confused")}</span>}
                {it.saved && <span className="badge bg-accent-soft text-accent">{t("saved.f_saved")}</span>}
                {it.lastResult !== null && (
                  <span className={`badge ${it.lastResult ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{it.lastResult ? t("saved.last_correct") : t("saved.last_wrong")}</span>
                )}
                {it.lastGradedAt && (
                  <span className="badge bg-background text-muted" title={t("saved.last_solved_title")}>
                    {t("saved.last_solved", { t: fmtKst(it.lastGradedAt) })}
                  </span>
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
