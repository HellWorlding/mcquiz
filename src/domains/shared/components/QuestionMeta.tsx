"use client";
import Link from "next/link";
import { difficultyLabel, trapLabel } from "@/domains/shared/labels";
import { useLang, useT } from "@/domains/shared/i18n-client";

type Q = {
  difficulty: string | null;
  topic: string | null;
  trap_types: string[];
  source_quote: string | null;
  points?: number | null;
  source_page?: number | null;
  /** 있으면 "원문 보기" 링크를 만든다 (책 쪽수 또는 근거 문장으로 자료를 찾아간다) */
  subject_id?: string | null;
  unit_id?: string | null;
};

function sourceHref(q: Q): string | null {
  if (!q.subject_id || (!q.source_page && !q.source_quote)) return null;
  const p = new URLSearchParams({ subject: q.subject_id });
  if (q.unit_id) p.set("unit", q.unit_id);
  if (q.source_page) p.set("page", String(q.source_page));
  if (q.source_quote) p.set("text", q.source_quote.slice(0, 200));
  return `/sources/find?${p}`;
}

/** 난이도·주제·함정 유형 배지 */
export function QuestionBadges({ q, showTraps = true }: { q: Q; showTraps?: boolean }) {
  const t = useT();
  const lang = useLang();
  const d = difficultyLabel(q.difficulty, lang);
  if (!d && !q.topic && !q.points && (!showTraps || q.trap_types.length === 0)) return null;
  return (
    <p className="flex flex-wrap gap-1.5 text-xs">
      {q.points ? <span className="badge bg-background text-muted">{t("quiz.points", { n: q.points })}</span> : null}
      {d && <span className={`badge ${q.difficulty === "very_hard" ? "bg-bad-soft text-bad" : q.difficulty === "hard" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>{t("quiz.difficulty", { d })}</span>}
      {q.topic && <span className="badge bg-background text-muted">{q.topic}</span>}
      {showTraps && q.trap_types.map((tt) => (
        <span key={tt} className="badge bg-warn-soft text-warn">
          {t("quiz.trap", { t: trapLabel(tt, lang) })}
        </span>
      ))}
    </p>
  );
}

/** 정답 근거 문장 */
export function SourceQuote({ q, className = "" }: { q: Q; className?: string }) {
  const t = useT();
  if (!q.source_quote && !q.source_page) return null;
  const href = sourceHref(q);
  return (
    <blockquote className={`rounded-lg border-l-4 border-accent bg-accent-soft/30 px-3 py-2 text-sm ${className}`}>
      <span className="mr-1 text-xs font-semibold text-muted">{t("quiz.evidence_label")}{q.source_page ? ` · ${t("quiz.book_page", { n: q.source_page })}` : ""}</span>
      {q.source_quote && <span className="whitespace-pre-wrap">{q.source_quote}</span>}
      {href && (
        <Link href={href} target="_blank" rel="noopener" className="ml-2 inline-block text-xs font-semibold text-accent hover:underline">
          {t("source.open")}
        </Link>
      )}
    </blockquote>
  );
}
