import { describe, expect, it } from "vitest";
import { isReportStatus, validateReport } from "./report";

describe("QuestionReport 불변식 (03 §5)", () => {
  it("메시지 1~100자", () => {
    expect(validateReport({ questionId: "q", kind: "typo", message: "" }).ok).toBe(false);
    expect(validateReport({ questionId: "q", kind: "typo", message: "  " }).ok).toBe(false);
    expect(validateReport({ questionId: "q", kind: "typo", message: "m".repeat(101) }).ok).toBe(false);
    expect(validateReport({ questionId: "q", kind: "typo", message: "m".repeat(100) }).ok).toBe(true);
  });
  it("문항 id 필수", () => {
    expect(validateReport({ questionId: "", kind: "typo", message: "m" }).ok).toBe(false);
  });
  it("kind 열거: 모르는 값은 other, 공백 제거", () => {
    expect(validateReport({ questionId: "q", kind: "answer", message: " m " })).toEqual({ ok: true, data: { questionId: "q", kind: "answer", message: "m" } });
    expect(validateReport({ questionId: "q", kind: "spam", message: "m" })).toMatchObject({ ok: true, data: { kind: "other" } });
  });
  it("status 열거는 open/done 만", () => {
    expect(isReportStatus("open")).toBe(true);
    expect(isReportStatus("done")).toBe(true);
    expect(isReportStatus("progress")).toBe(false);
  });
});
