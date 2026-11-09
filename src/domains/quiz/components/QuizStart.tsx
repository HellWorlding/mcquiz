"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Collection, QuestionSet, Subject, Unit } from "@/domains/shared/types";
import { subtreeIds, type TreeNode } from "@/domains/shared/tree";
import { createCollectionAction, deleteCollectionAction } from "@/domains/subjects/collection-actions";
import { deleteSessionAction } from "@/domains/quiz/actions";
import type { UnfinishedSession } from "@/domains/quiz/sessions";
import { DIFFICULTIES, difficultyLabel } from "@/domains/shared/labels";
import { useLang, useT } from "@/domains/shared/i18n-client";

type Props = {
  subject: Subject;
  units: TreeNode<Unit>[];
  sets: (QuestionSet & { question_count: number })[];
  collections: TreeNode<Collection>[];
  unitCounts: Record<string, number>;
  collectionCounts: Record<string, number>;
  user: { id: string; isAdmin: boolean } | null;
  sessions: UnfinishedSession[];
};

type Tab = "units" | "collections" | "sets";
const COUNTS = ["10", "20", "40", "all"] as const;

export function QuizStart({ subject, units, sets, collections, unitCounts, collectionCounts, user, sessions }: Props) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [sessionPending, startSessionTransition] = useTransition();
  const [tab, setTab] = useState<Tab>(units.length ? "units" : sets.length ? "sets" : "collections");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<(typeof COUNTS)[number]>("all");
  const [order, setOrder] = useState<"seq" | "random">("seq");
  const [offset, setOffset] = useState(0);
  const [difficulty, setDifficulty] = useState<string>("");
  const [under, setUnder] = useState<string>(""); // 풀이 횟수 N회 미만만
  const [expanded, setExpanded] = useState<Set<string>>(new Set(units.map((u) => u.id)));

  // 단원별 누적 문항 수 (하위 포함)
  const unitTotal = useMemo(() => {
    const m = new Map<string, number>();
    const walk = (n: TreeNode<Unit>): number => {
      const t = (unitCounts[n.id] ?? 0) + n.children.reduce((s, c) => s + walk(c), 0);
      m.set(n.id, t);
      return t;
    };
    units.forEach(walk);
    return m;
  }, [units, unitCounts]);

  const allUnits = useMemo(() => {
    const out: TreeNode<Unit>[] = [];
    const walk = (n: TreeNode<Unit>[]) => {
      for (const x of n) {
        out.push(x);
        walk(x.children);
      }
    };
    walk(units);
    return out;
  }, [units]);

  // 선택된 단원(하위 포함)의 총 문항 수. 상위를 골랐으면 하위는 따로 세지 않는다.
  const selectedTotal = useMemo(() => {
    const picked = allUnits.filter((u) => selected.has(u.id));
    const covered = new Set<string>();
    let total = 0;
    for (const u of picked) {
      if (covered.has(u.id)) continue;
      for (const id of subtreeIds(u)) covered.add(id);
      total += unitTotal.get(u.id) ?? 0;
    }
    return total;
  }, [allUnits, selected, unitTotal]);

  // "N번부터 M번까지" 직접 입력 (비우면 위의 문항 수·구간 설정을 따른다)
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const customRange = (() => {
    const f = Number(rangeFrom);
    const t = Number(rangeTo);
    if (!rangeFrom && !rangeTo) return null;
    if (!Number.isInteger(f) || f < 1) return null;
    const to = rangeTo ? t : selectedTotal;
    if (!Number.isInteger(to) || to < f) return null;
    return { from: f, to: Math.min(to, selectedTotal) };
  })();

  const toggleUnit = (node: TreeNode<Unit>) => {
    const ids = subtreeIds(node);
    setSelected((prev) => {
      const next = new Set(prev);
      const on = !next.has(node.id);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setOffset(0);
  };

  const start = () => {
    const p = new URLSearchParams({ subject: subject.id, count, order });
    if (order === "seq" && count !== "all") p.set("offset", String(offset));
    if (customRange) {
      // 번호 구간이 우선: 순서대로, from-1 부터 (to-from+1) 개
      p.set("order", "seq");
      p.set("offset", String(customRange.from - 1));
      p.set("count", String(customRange.to - customRange.from + 1));
    }
    if (difficulty) p.set("difficulty", difficulty);
    if (under && Number(under) > 0) p.set("under", under);
    // 상위가 선택된 하위는 빼고 보낸다 (서버가 하위를 다시 펼친다)
    const roots = allUnits.filter((u) => selected.has(u.id) && !(u.parent_id && selected.has(u.parent_id)));
    if (roots.length) p.set("units", roots.map((u) => u.id).join(","));
    router.push(`/quiz?${p.toString()}`);
  };

  const chunks = useMemo(() => {
    if (count === "all" || order !== "seq" || selectedTotal === 0) return [];
    const n = Number(count);
    const out: { offset: number; label: string }[] = [];
    for (let o = 0; o < selectedTotal; o += n) out.push({ offset: o, label: `${o + 1}~${Math.min(o + n, selectedTotal)}번` });
    return out;
  }, [count, order, selectedTotal]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{subject.name}</h1>
        <div className="flex gap-1">
          <Link href={`/chat?subject=${subject.id}`} target="_blank" rel="noopener" className="btn-ghost btn-sm">
            {t("start.ask_ai")}
          </Link>
          <Link href={`/weak?subject=${subject.id}`} className="btn-ghost btn-sm">
            {t("start.saved_link")}
          </Link>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold">{t("start.resume")}</div>
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <Link href={`/quiz?session=${s.id}`} className="btn-primary btn-sm">
                {s.title} · {Math.min(s.position + 1, s.total)}/{s.total}
              </Link>
              <span className="text-muted">{new Date(s.updated_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              <button
                className="btn-ghost btn-sm ml-auto text-bad"
                disabled={sessionPending}
                onClick={() =>
                  startSessionTransition(async () => {
                    await deleteSessionAction(s.id);
                    router.refresh();
                  })
                }
              >
                {t("start.discard")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-card p-1">
        {(
          [
            ["units", t("start.tab_units")],
            ["collections", t("start.tab_collections")],
            ["sets", t("start.tab_sets")],
          ] as [Tab, string][]
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

      {tab === "units" && (
        <div className="card">
          {units.length === 0 ? (
            <p className="text-muted">{t("start.no_units")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {units.map((u) => (
                <UnitRow
                  key={u.id}
                  node={u}
                  selected={selected}
                  expanded={expanded}
                  total={unitTotal}
                  onToggle={toggleUnit}
                  onExpand={(id) =>
                    setExpanded((prev) => {
                      const n = new Set(prev);
                      if (n.has(id)) n.delete(id);
                      else n.add(id);
                      return n;
                    })
                  }
                />
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            <span>{t("start.selected", { n: selectedTotal })}</span>
            <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              {t("start.clear")}
            </button>
          </div>
        </div>
      )}

      {tab === "sets" && (
        <ul className="flex flex-col gap-2">
          {sets.length === 0 && <li className="card text-muted">{t("start.no_sets")}</li>}
          {sets.map((s) => (
            <li key={s.id} className="card flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{s.title}</div>
                <div className="text-sm text-muted">{t("common.count_questions", { n: s.question_count })}</div>
              </div>
              <div className="flex gap-2">
                <Link href={`/quiz?set=${s.id}&count=all&order=seq`} className="btn-secondary btn-sm">
                  {t("start.in_order")}
                </Link>
                <Link href={`/quiz?set=${s.id}&count=all&order=random`} className="btn-primary btn-sm">
                  {t("start.random")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === "collections" && (
        <CollectionsPanel subject={subject} collections={collections} counts={collectionCounts} user={user} />
      )}

      {tab === "units" && (
        <div className="card flex flex-col gap-4">
          <div>
            <div className="label">{t("start.count")}</div>
            <div className="flex gap-2">
              {COUNTS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCount(c);
                    setOffset(0);
                  }}
                  className={`flex-1 rounded-xl border py-2 font-semibold ${count === c ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                >
                  {c === "all" ? t("common.all") : c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">{t("start.order")}</div>
            <div className="flex gap-2">
              {(
                [
                  ["seq", t("start.in_order")],
                  ["random", t("start.random")],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setOrder(k)}
                  className={`flex-1 rounded-xl border py-2 font-semibold ${order === k ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">{t("start.difficulty")}</div>
            <div className="flex flex-wrap gap-2">
              {["", ...DIFFICULTIES].map((d) => (
                <button
                  key={d || "all"}
                  onClick={() => setDifficulty(d)}
                  className={`rounded-full border px-3 py-1 text-sm ${difficulty === d ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                >
                  {d ? difficultyLabel(d, lang) : t("common.all")}
                </button>
              ))}
            </div>
          </div>
          {chunks.length > 1 && (
            <div>
              <div className="label">{t("start.range")}</div>
              <div className="flex flex-wrap gap-2">
                {chunks.map((c) => (
                  <button
                    key={c.offset}
                    onClick={() => setOffset(c.offset)}
                    className={`rounded-full border px-3 py-1 text-sm ${offset === c.offset ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="label">{t("start.under")}</div>
            <div className="flex flex-wrap gap-2">
              {[
                ["", t("start.under_all")],
                ["1", t("start.under_unseen")],
                ["2", t("start.under_n", { n: 2 })],
                ["3", t("start.under_n", { n: 3 })],
              ].map(([v, label]) => (
                <button
                  key={v || "all"}
                  onClick={() => setUnder(v)}
                  className={`rounded-full border px-3 py-1 text-sm ${under === v ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">{t("start.under_desc")}</p>
          </div>
          <div>
            <div className="label">{t("start.pick_numbers")}</div>
            <div className="flex items-center gap-2">
              <input
                className="input w-24 text-center"
                inputMode="numeric"
                placeholder="1"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ""))}
              />
              <span className="text-muted">{t("start.from")}</span>
              <input
                className="input w-24 text-center"
                inputMode="numeric"
                placeholder={String(selectedTotal || "")}
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ""))}
              />
              <span className="text-muted">{t("start.to")}</span>
              {(rangeFrom || rangeTo) && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setRangeFrom("");
                    setRangeTo("");
                  }}
                >
                  {t("start.clear_range")}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              {customRange
                ? t("start.range_ok", { from: customRange.from, to: customRange.to, n: customRange.to - customRange.from + 1 })
                : (rangeFrom || rangeTo)
                  ? t("start.range_bad")
                  : t("start.range_desc")}
            </p>
          </div>
          <button className="btn-primary text-lg" disabled={selectedTotal === 0 || (!!(rangeFrom || rangeTo) && !customRange)} onClick={start}>
            {selectedTotal === 0 ? t("start.choose_unit") : customRange ? t("start.start_range", { from: customRange.from, to: customRange.to }) : t("common.start")}
          </button>
        </div>
      )}
    </section>
  );
}

function UnitRow({
  node,
  selected,
  expanded,
  total,
  onToggle,
  onExpand,
}: {
  node: TreeNode<Unit>;
  selected: Set<string>;
  expanded: Set<string>;
  total: Map<string, number>;
  onToggle: (n: TreeNode<Unit>) => void;
  onExpand: (id: string) => void;
}) {
  const isOn = selected.has(node.id);
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.id);
  return (
    <li>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: node.depth * 16 }}>
        {hasKids ? (
          <button onClick={() => onExpand(node.id)} className="w-6 text-muted" aria-label="펼치기">
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-6" />
        )}
        <label className="flex flex-1 cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 accent-accent" checked={isOn} onChange={() => onToggle(node)} />
          <span className={isOn ? "font-semibold" : ""}>
            {node.no !== null ? `${node.no}. ` : ""}
            {node.title}
          </span>
          <span className="ml-auto text-sm text-muted">{total.get(node.id) ?? 0}</span>
        </label>
      </div>
      {hasKids && open && (
        <ul>
          {node.children.map((c) => (
            <UnitRow key={c.id} node={c} selected={selected} expanded={expanded} total={total} onToggle={onToggle} onExpand={onExpand} />
          ))}
        </ul>
      )}
    </li>
  );
}

function CollectionsPanel({
  subject,
  collections,
  counts,
  user,
}: {
  subject: Subject;
  collections: TreeNode<Collection>[];
  counts: Record<string, number>;
  user: { id: string; isAdmin: boolean } | null;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [scope, setScope] = useState<"private" | "shared">("private");
  const [error, setError] = useState<string | null>(null);
  const flat: TreeNode<Collection>[] = [];
  const walk = (n: TreeNode<Collection>[]) => {
    for (const x of n) {
      flat.push(x);
      walk(x.children);
    }
  };
  walk(collections);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const r = await createCollectionAction({ subjectId: subject.id, parentId: parentId || null, title, scope });
      if (!r.ok) setError(r.error);
      else {
        setTitle("");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {flat.length === 0 && (
        <p className="card text-muted">{t("start.no_collections")}</p>
      )}
      {flat.map((c) => (
        <div key={c.id} className="card flex items-center justify-between gap-2" style={{ marginLeft: c.depth * 12 }}>
          <div>
            <div className="font-semibold">
              {c.title}{" "}
              <span className={`badge ${c.scope === "shared" ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}>
                {c.scope === "shared" ? t("start.shared") : t("start.private")}
              </span>
            </div>
            <div className="text-sm text-muted">
              {t("common.count_questions", { n: counts[c.id] ?? 0 })}{c.children.length ? ` (+${c.children.length})` : ""}
            </div>
          </div>
          <div className="flex gap-1">
            <Link href={`/collections/${c.id}`} className="btn-secondary btn-sm">
              {t("start.view")}
            </Link>
            <Link href={`/quiz?collection=${c.id}&count=all&order=random`} className="btn-primary btn-sm">
              {t("common.solve")}
            </Link>
            {user && (user.isAdmin || c.created_by === user.id) && (
              <button
                className="btn-danger btn-sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteCollectionAction(c.id);
                    router.refresh();
                  })
                }
              >
                {t("common.delete")}
              </button>
            )}
          </div>
        </div>
      ))}
      {user && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold">{t("start.new_collection")}</div>
          <input className="input" placeholder={t("start.collection_name")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t("start.top_level")}</option>
            {flat.map((c) => (
              <option key={c.id} value={c.id}>
                {"　".repeat(c.depth)}
                {c.title}
              </option>
            ))}
          </select>
          {user.isAdmin && (
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value as "private" | "shared")}>
              <option value="private">{t("start.private_opt")}</option>
              <option value="shared">{t("start.shared_opt")}</option>
            </select>
          )}
          {error && <p className="text-sm text-bad">{error}</p>}
          <button className="btn-secondary" disabled={pending || !title.trim()} onClick={create}>
            {t("start.create")}
          </button>
        </div>
      )}
    </div>
  );
}
