import { describe, expect, it } from "vitest";
import { listReports, reportQuestion, resolveReport } from "./reports";
import { admin, fakeDeps, user } from "./fakes.test-util";

describe("reports use cases", () => {
  it("게스트 거부, 관리자 전용 거부", async () => {
    expect(await reportQuestion(fakeDeps(null).deps, { questionId: "q1", kind: "typo", message: "m" })).toEqual({ ok: false, error: "로그인이 필요합니다." });
    const { deps } = fakeDeps(user);
    expect(await resolveReport(deps, "r1", "done")).toEqual({ ok: false, error: "관리자만 할 수 있습니다." });
    expect(await listReports(deps)).toEqual({ ok: false, error: "관리자만 할 수 있습니다." });
  });
  it("신고: 검증·문항 존재 확인 후 저장", async () => {
    const { deps, reports } = fakeDeps(user, { questionIds: ["q1"] });
    expect((await reportQuestion(deps, { questionId: "q1", kind: "typo", message: "" })).ok).toBe(false);
    expect(await reportQuestion(deps, { questionId: "zzz", kind: "typo", message: "m" })).toEqual({ ok: false, error: "문항을 찾을 수 없습니다." });
    expect(await reportQuestion(deps, { questionId: "q1", kind: "answer", message: " m " })).toEqual({ ok: true, data: undefined });
    expect(reports[0]).toMatchObject({ userId: "u", questionId: "q1", kind: "answer", message: "m", status: "open" });
  });
  it("신고 하루 10건 제한", async () => {
    const { deps } = fakeDeps(user);
    for (let i = 0; i < 10; i++) expect((await reportQuestion(deps, { questionId: "q1", kind: "typo", message: `m${i}` })).ok).toBe(true);
    expect(await reportQuestion(deps, { questionId: "q1", kind: "typo", message: "m" })).toEqual({ ok: false, error: "신고는 하루에 10건까지입니다." });
  });
  it("관리자: 처리됨/다시 열기, 목록에 문항 요약·삭제된 문항 표시", async () => {
    const { deps: asUser, reports } = fakeDeps(user, { questionIds: ["q1"] });
    await reportQuestion(asUser, { questionId: "q1", kind: "typo", message: "m" });
    reports.push({ id: "gone", userId: "u", questionId: "deleted-q", kind: "other", message: "x", status: "open", createdAt: "2026-01-01T00:00:00Z" });
    const asAdmin = { ...asUser, user: admin };
    const all = await listReports(asAdmin);
    expect(all.ok && all.data.map((r) => [r.prompt, r.setId])).toEqual([
      ["P-q1", "set-q1"],
      ["(삭제된 문항)", null],
    ]);
    expect(await resolveReport(asAdmin, reports[0].id, "done")).toEqual({ ok: true, data: undefined });
    expect(reports[0].status).toBe("done");
    const open = await listReports(asAdmin, "open");
    expect(open.ok && open.data.map((r) => r.id)).toEqual(["gone"]);
    expect(await resolveReport(asAdmin, reports[0].id, "open")).toEqual({ ok: true, data: undefined });
    expect(reports[0].status).toBe("open");
    expect((await resolveReport(asAdmin, reports[0].id, "progress" as never)).ok).toBe(false);
  });
});
