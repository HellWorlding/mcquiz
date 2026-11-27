import Link from "next/link";
import { requireAdmin } from "@/contexts/access/server";
import { listReports } from "@/contexts/community/ui/loaders";
import { ReportsAdmin } from "@/contexts/community/ui/components/ReportsAdmin";

export const metadata = { title: "문항 신고" };

export default async function ReportsPage() {
  await requireAdmin();
  const rows = await listReports();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">문항 신고 {rows.filter((r) => r.status === "open").length}건 대기</h1>
      {rows.length === 0 ? <p className="card text-muted">신고가 없습니다.</p> : <ReportsAdmin rows={rows} />}
      <p className="text-xs text-muted">
        세트 편집 화면에서 문항을 고친 뒤 &quot;처리됨&quot;을 누르세요. <Link href="/board" className="underline">게시판</Link>
      </p>
    </div>
  );
}
