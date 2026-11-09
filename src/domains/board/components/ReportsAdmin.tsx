"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveReportAction } from "@/domains/board/actions";

const KIND: Record<string, string> = { answer: "정답 오류", ambiguous: "보기 애매", typo: "오타", other: "기타" };

export function ReportsAdmin({
  rows,
}: {
  rows: { id: string; kind: string; message: string; status: string; created_at: string; questionId: string; prompt: string; setId: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id} className={`card ${r.status === "done" ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="badge bg-warn-soft text-warn">{KIND[r.kind] ?? r.kind}</span>
            <span className="text-muted">{new Date(r.created_at).toLocaleString("ko-KR")}</span>
            <span className={`badge ${r.status === "done" ? "bg-ok-soft text-ok" : "bg-background text-muted"}`}>{r.status === "done" ? "처리됨" : "대기"}</span>
            <div className="ml-auto flex gap-1">
              {r.setId && (
                <Link href={`/admin/sets/${r.setId}`} className="btn-ghost btn-sm">
                  세트 열기
                </Link>
              )}
              <Link href={`/quiz?ids=${r.questionId}`} className="btn-ghost btn-sm">
                풀어보기
              </Link>
              <button
                className="btn-secondary btn-sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await resolveReportAction(r.id, r.status === "done" ? "open" : "done");
                    router.refresh();
                  })
                }
              >
                {r.status === "done" ? "다시 열기" : "처리됨"}
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm font-semibold">{r.prompt}</p>
          <p className="mt-1 text-sm">{r.message}</p>
        </li>
      ))}
    </ul>
  );
}
