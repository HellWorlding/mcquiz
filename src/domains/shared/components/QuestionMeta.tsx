import { difficultyLabel, trapLabel } from "@/domains/shared/labels";

type Q = { difficulty: string | null; topic: string | null; trap_types: string[]; source_quote: string | null; points?: number | null; source_page?: number | null };

/** 난이도·주제·함정 유형 배지 */
export function QuestionBadges({ q, showTraps = true }: { q: Q; showTraps?: boolean }) {
  const d = difficultyLabel(q.difficulty);
  if (!d && !q.topic && !q.points && (!showTraps || q.trap_types.length === 0)) return null;
  return (
    <p className="flex flex-wrap gap-1.5 text-xs">
      {q.points ? <span className="badge bg-background text-muted">{q.points}점</span> : null}
      {d && <span className={`badge ${q.difficulty === "very_hard" ? "bg-bad-soft text-bad" : q.difficulty === "hard" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>난이도 {d}</span>}
      {q.topic && <span className="badge bg-background text-muted">{q.topic}</span>}
      {showTraps && q.trap_types.map((t) => (
        <span key={t} className="badge bg-warn-soft text-warn">
          함정: {trapLabel(t)}
        </span>
      ))}
    </p>
  );
}

/** 정답 근거 문장 */
export function SourceQuote({ q, className = "" }: { q: Q; className?: string }) {
  if (!q.source_quote && !q.source_page) return null;
  return (
    <blockquote className={`rounded-lg border-l-4 border-accent bg-accent-soft/30 px-3 py-2 text-sm ${className}`}>
      <span className="mr-1 text-xs font-semibold text-muted">근거{q.source_page ? ` · 책 p.${q.source_page}` : ""}</span>
      {q.source_quote && <span className="whitespace-pre-wrap">{q.source_quote}</span>}
    </blockquote>
  );
}
