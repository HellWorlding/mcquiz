import type { Db, Row } from "@/shared/db/types";
import { toReportKind, toReportStatus, type QuestionReport } from "../../domain/report";
import type { ReportRepo } from "../../application/ports";

/** 관리자 목록 상한 (옛 /admin/reports 와 같음) */
const LIST_LIMIT = 200;

function toReport(r: Row<"community", "reports">): QuestionReport {
  return { id: r.id, userId: r.user_id, questionId: r.question_id, kind: toReportKind(r.kind), message: r.message, status: toReportStatus(r.status), createdAt: r.created_at };
}

export function reportRepo(db: Db): ReportRepo {
  const reports = () => db.schema("community").from("reports");
  return {
    async list(status) {
      let q = reports().select("*");
      if (status) q = q.eq("status", status);
      const { data, error } = await q.order("status").order("created_at", { ascending: false }).limit(LIST_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []).map(toReport);
    },
    async countSince(userId, since) {
      const { count, error } = await reports().select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async insert(userId, r) {
      const { error } = await reports().insert({ user_id: userId, question_id: r.questionId, kind: r.kind, message: r.message });
      if (error) throw new Error(error.message);
    },
    async setStatus(id, status) {
      const { error } = await reports().update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
