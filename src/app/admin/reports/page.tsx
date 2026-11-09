import Link from "next/link";
import { createClient } from "@/domains/auth/supabase/server";
import { ReportsAdmin } from "@/domains/board/components/ReportsAdmin";

export const metadata = { title: "문제 신고" };

export default async function ReportsPage() {
  const db = await createClient();
  const { data } = await db
    .from("question_reports")
    .select("id, kind, message, status, created_at, question_id, questions(prompt, set_id, subject_id)")
    .order("status")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []).map((r) => {
    const q = r.questions as unknown as { prompt: string; set_id: string; subject_id: string } | null;
    return { id: r.id, kind: r.kind, message: r.message, status: r.status, created_at: r.created_at, questionId: r.question_id, prompt: q?.prompt ?? "(삭제된 문항)", setId: q?.set_id ?? null };
  });
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">문제 신고 {rows.filter((r) => r.status === "open").length}건 대기</h1>
      {rows.length === 0 ? <p className="card text-muted">신고가 없습니다.</p> : <ReportsAdmin rows={rows} />}
      <p className="text-xs text-muted">
        세트 편집 화면에서 문항을 고친 뒤 &quot;처리됨&quot;을 누르세요. <Link href="/board" className="underline">게시판</Link>
      </p>
    </div>
  );
}
