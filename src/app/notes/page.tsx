import Link from "next/link";
import { requireUser } from "@/domains/auth/session";
import { listSubjects } from "@/domains/subjects/queries";
import { listMyNotes } from "@/domains/notes/queries";
import { FontSizeControl, NoteBox } from "@/domains/notes/components/NoteBox";
import { cleanExplanation } from "@/domains/shared/labels";

export const metadata = { title: "필기" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireUser("/notes");
  const { subject } = await searchParams;
  const subjects = await listSubjects();
  const current = subjects.find((s) => s.id === subject) ?? subjects[0] ?? null;
  const notes = await listMyNotes(current?.id ?? null);

  // 단원별로 묶기
  const groups = new Map<string, typeof notes>();
  for (const n of notes) {
    const list = groups.get(n.unitLabel) ?? [];
    list.push(n);
    groups.set(n.unitLabel, list);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">필기</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{notes.length}개</span>
          <FontSizeControl />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {subjects.map((s) => (
          <Link
            key={s.id}
            href={`/notes?subject=${s.id}`}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${s.id === current?.id ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>
      {notes.length === 0 ? (
        <p className="card text-muted">아직 메모가 없습니다. 문제를 풀 때 아래 메모 칸에 적으면 여기에 모입니다.</p>
      ) : (
        [...groups.entries()].map(([unit, items]) => (
          <div key={unit} className="card flex flex-col gap-4">
            <h2 className="font-bold">{unit}</h2>
            {items.map((n) => (
              <div key={n.questionId} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">
                    <span className="mr-1 text-accent">{n.noLabel}</span>
                    {n.topic && <span className="badge mr-1 bg-background text-muted">{n.topic}</span>}
                    {n.prompt}
                  </p>
                  <Link href={`/quiz?ids=${n.questionId}`} className="btn-ghost btn-sm shrink-0">
                    풀기
                  </Link>
                </div>
                {n.correctText && <p className="text-xs text-ok">정답: {n.correctText}</p>}
                <NoteBox
                  questionId={n.questionId}
                  initial={n.content}
                  showFontControl={false}
                  importText={[n.explanation, n.sourceQuote ? `근거${n.sourcePage ? ` (책 p.${n.sourcePage})` : ""}: ${n.sourceQuote}` : null].filter(Boolean).join("\n\n") || null}
                />
                {(n.explanation || n.correctExplanation || n.sourceQuote) && (
                  <details className="rounded-lg bg-background px-3 py-2 text-sm">
                    <summary className="cursor-pointer text-muted">해설·근거 보기</summary>
                    {n.correctExplanation && <p className="mt-2 whitespace-pre-wrap text-ok">{cleanExplanation(n.correctExplanation)}</p>}
                    {n.explanation && <p className="mt-2 whitespace-pre-wrap">{n.explanation}</p>}
                    {n.sourceQuote && (
                      <p className="mt-2 whitespace-pre-wrap text-muted">
                        근거{n.sourcePage ? ` · 책 p.${n.sourcePage}` : ""}: {n.sourceQuote}
                      </p>
                    )}
                  </details>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}
