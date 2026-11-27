/** Community 도메인: 문항 신고 (순수) */
import { err, ok, type Result } from "@/shared/result";

export const REPORT_KINDS = ["answer", "ambiguous", "typo", "other"] as const;
export const REPORT_STATUSES = ["open", "done"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_MESSAGE_MAX = 100;

export type QuestionReport = {
  id: string;
  userId: string;
  questionId: string;
  kind: ReportKind;
  message: string;
  status: ReportStatus;
  createdAt: string;
};

export type NewReport = { questionId: string; kind: ReportKind; message: string };

export function isReportKind(v: unknown): v is ReportKind {
  return typeof v === "string" && (REPORT_KINDS as readonly string[]).includes(v);
}
export function isReportStatus(v: unknown): v is ReportStatus {
  return typeof v === "string" && (REPORT_STATUSES as readonly string[]).includes(v);
}
export function toReportKind(v: unknown): ReportKind {
  return isReportKind(v) ? v : "other";
}
export function toReportStatus(v: unknown): ReportStatus {
  return isReportStatus(v) ? v : "open";
}

/** 신고 메시지 1~100자 (공백 제거 후), 문항 id 필수. kind 는 열거값이 아니면 other */
export function validateReport(input: { questionId: string; kind: string; message: string }): Result<NewReport> {
  const message = input.message.trim();
  if (!input.questionId) return err("신고할 문항이 없습니다.");
  if (!message || message.length > REPORT_MESSAGE_MAX) return err(`내용은 1~${REPORT_MESSAGE_MAX}자입니다.`);
  return ok({ questionId: input.questionId, kind: toReportKind(input.kind), message });
}
