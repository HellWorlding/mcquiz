import { err, ok, type Result } from "@/shared/result";
import { isReportStatus, validateReport, type QuestionReport, type ReportStatus } from "../domain/report";
import { DAILY_LIMIT, dayAgo, message, requireAdmin, requireUser } from "./guards";
import type { CommunityDeps } from "./ports";

/** 관리자 신고 목록 한 줄: 신고 + 문항 요약 */
export type ReportRow = QuestionReport & { prompt: string; setId: string | null };

export const DELETED_QUESTION_PROMPT = "(삭제된 문항)";

/** 문항 신고 (하루 10건). 대상 문항은 존재해야(= 내가 읽을 수 있어야) 한다 */
export async function reportQuestion(deps: CommunityDeps, input: { questionId: string; kind: string; message: string }): Promise<Result<void>> {
  const u = requireUser(deps);
  if (!u.ok) return u;
  const v = validateReport(input);
  if (!v.ok) return v;
  try {
    if (!(await deps.questions.exists(v.data.questionId))) return err("문항을 찾을 수 없습니다.");
    if ((await deps.reports.countSince(u.data.id, dayAgo(deps))) >= DAILY_LIMIT) return err(`신고는 하루에 ${DAILY_LIMIT}건까지입니다.`);
    await deps.reports.insert(u.data.id, v.data);
    return ok(undefined);
  } catch (e) {
    return err(message(e));
  }
}

/** 관리자: 처리됨/다시 열기 */
export async function resolveReport(deps: CommunityDeps, id: string, status: ReportStatus): Promise<Result<void>> {
  const a = requireAdmin(deps);
  if (!a.ok) return a;
  if (!isReportStatus(status)) return err("알 수 없는 상태입니다.");
  try {
    await deps.reports.setStatus(id, status);
    return ok(undefined);
  } catch (e) {
    return err(message(e));
  }
}

/** 관리자: 신고 목록 (+문항 요약). 삭제된 문항은 "(삭제된 문항)" */
export async function listReports(deps: CommunityDeps, status?: ReportStatus): Promise<Result<ReportRow[]>> {
  const a = requireAdmin(deps);
  if (!a.ok) return a;
  try {
    const rows = await deps.reports.list(status);
    const ids = [...new Set(rows.map((r) => r.questionId))];
    const q = new Map(ids.length ? (await deps.questions.summaries(ids)).map((s) => [s.id, s]) : []);
    return ok(rows.map((r) => ({ ...r, prompt: q.get(r.questionId)?.prompt ?? DELETED_QUESTION_PROMPT, setId: q.get(r.questionId)?.setId ?? null })));
  } catch (e) {
    return err(message(e));
  }
}
