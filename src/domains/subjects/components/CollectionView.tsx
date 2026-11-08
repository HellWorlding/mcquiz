"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Collection, QuestionWithChoices } from "@/domains/shared/types";
import { removeFromCollectionAction } from "@/domains/subjects/collection-actions";

export function CollectionView({ collection, questions, canEdit }: { collection: Collection; questions: QuestionWithChoices[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = (questionId: string) => {
    setRemoving(questionId);
    startTransition(async () => {
      await removeFromCollectionAction(collection.id, questionId);
      setRemoving(null);
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link href={`/subjects/${collection.subject_id}`} className="text-sm text-muted">
            ← 주제로
          </Link>
          <h1 className="text-2xl font-bold">
            {collection.title}{" "}
            <span className={`badge ${collection.scope === "shared" ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}>
              {collection.scope === "shared" ? "공용" : "개인"}
            </span>
          </h1>
          <p className="text-sm text-muted">{questions.length}문항</p>
        </div>
        {questions.length > 0 && (
          <div className="flex gap-2">
            <Link href={`/quiz?collection=${collection.id}&count=all&order=seq`} className="btn-secondary btn-sm">
              순서대로
            </Link>
            <Link href={`/quiz?collection=${collection.id}&count=all&order=random`} className="btn-primary btn-sm">
              무작위
            </Link>
          </div>
        )}
      </div>

      {questions.length === 0 ? (
        <p className="card text-muted">아직 문항이 없습니다. 퀴즈 결과나 약점 화면에서 &quot;묶음에 추가&quot;로 넣을 수 있습니다.</p>
      ) : (
        <ol className="card flex flex-col gap-3">
          {questions.map((q, i) => {
            const correct = q.choices.find((c) => c.ord === q.correct_choice);
            return (
              <li key={q.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">
                    {i + 1}. {q.prompt}
                  </p>
                  {canEdit && (
                    <button className="btn-ghost btn-sm shrink-0 text-bad" disabled={pending && removing === q.id} onClick={() => remove(q.id)}>
                      {removing === q.id ? "빼는 중…" : "묶음에서 빼기"}
                    </button>
                  )}
                </div>
                {correct && <p className="mt-1 text-sm text-ok">정답: {correct.text}</p>}
                {correct?.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{correct.explanation}</p>}
              {q.explanation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
