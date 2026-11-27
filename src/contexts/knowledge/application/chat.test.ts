import { describe, expect, it } from "vitest";
import { chat, chatContext } from "./chat";
import { admin, makeFakeDeps, member, rawHit } from "./fakes.test-util";

describe("chatContext", () => {
  it("로그인 필요", async () => {
    expect((await chatContext(makeFakeDeps(null).deps, "S")).ok).toBe(false);
  });
  it("한도·모드·AI 켜짐·이전 대화", async () => {
    const { deps, st } = makeFakeDeps(member, { chat: () => "답" });
    const none = await chatContext(deps, "S", "q");
    expect(none.ok && none.data).toMatchObject({ mode: "open", aiEnabled: true, quota: { limit: 10, used: 0, remaining: 10 }, history: [] });
    await deps.sources.insert({ subjectId: "S", unitId: null, kind: "script", title: "t", content: "", pageRange: null, url: null });
    st.logs.push({ userId: "u1", subjectId: "S", questionId: "q", question: "왜?", answer: "**이유**", createdAt: deps.now().toISOString() });
    st.logs.push({ userId: "other", subjectId: "S", questionId: "q", question: "남의 것", answer: "x", createdAt: deps.now().toISOString() });
    const r = await chatContext(deps, "S", "q");
    expect(r.ok && r.data.mode).toBe("grounded");
    expect(r.ok && r.data.history).toEqual([{ role: "user", content: "왜?" }, { role: "assistant", content: "'이유'" }]);
    expect(r.ok && r.data.quota.used).toBe(1);
    expect((await chatContext(makeFakeDeps(member).deps, "S")).ok && (await chatContext(makeFakeDeps(member).deps, "S"))).toMatchObject({ data: { aiEnabled: false } });
  });
});

describe("chat", () => {
  const ask = (text: string) => [{ role: "user" as const, content: text }];

  it("로그인·AI 켜짐·질문 검증", async () => {
    expect((await chat(makeFakeDeps(null, { chat: () => "" }).deps, { subjectId: "S", questionId: null, messages: ask("q") })).ok).toBe(false);
    expect(await chat(makeFakeDeps(member).deps, { subjectId: "S", questionId: null, messages: ask("q") })).toMatchObject({ ok: false, error: expect.stringContaining("AI 기능이 꺼져") });
    const { deps } = makeFakeDeps(member, { chat: () => "" });
    expect(await chat(deps, { subjectId: "S", questionId: null, messages: [] })).toEqual({ ok: false, error: "질문을 입력하세요." });
    expect((await chat(deps, { subjectId: "S", questionId: null, messages: ask("x".repeat(2001)) })).ok).toBe(false);
  });

  it("K5 한도를 넘으면 거부하고, 안이면 기록을 남기고 남은 횟수를 하나 줄인다", async () => {
    const { deps, st } = makeFakeDeps({ ...member, aiLimit: 2 }, { chat: () => "답입니다" });
    const a = await chat(deps, { subjectId: "S", questionId: null, messages: ask("첫 질문") });
    expect(a.ok && a.data.quota).toMatchObject({ limit: 2, used: 1, remaining: 1 });
    expect(st.logs).toHaveLength(1);
    const b = await chat(deps, { subjectId: "S", questionId: null, messages: ask("둘째") });
    expect(b.ok && b.data.quota.remaining).toBe(0);
    const c = await chat(deps, { subjectId: "S", questionId: null, messages: ask("셋째") });
    expect(c).toMatchObject({ ok: false, error: expect.stringContaining("12시간에 2회") });
    expect(st.logs).toHaveLength(2);
    // 관리자 기본 한도 100
    const adm = makeFakeDeps(admin, { chat: () => "답" });
    const r = await chat(adm.deps, { subjectId: "S", questionId: null, messages: ask("q") });
    expect(r.ok && r.data.quota.limit).toBe(100);
  });

  it("grounded: 자료를 검색해 [자료] 로 넣고 출처를 돌려준다. 문항 맥락은 화면 순서로 번호를 매긴다", async () => {
    let captured = { system: "", ctx: "" };
    const { deps, st } = makeFakeDeps(member, { chat: (system, ctx) => { captured = { system, ctx }; return "**정답**은 2번 [1]"; } });
    await deps.sources.insert({ subjectId: "S", unitId: null, kind: "script", title: "t", content: "", pageRange: null, url: null });
    st.questions.set("q", { id: "q", subjectId: "S", unitId: "u1", prompt: "P", topic: null, sourceQuote: null, explanation: "E", correctChoice: 1, choices: [{ ord: 1, text: "a" }, { ord: 2, text: "b" }] });
    const unitIdsSeen: (string[] | null)[] = [];
    st.hitsFor = (u) => { unitIdsSeen.push(u); return [rawHit("c1", { page: 5, kind: "book" })]; };
    const r = await chat(deps, { subjectId: "S", questionId: "q", messages: ask("왜?"), choiceOrder: [2, 1], revealAnswer: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.mode).toBe("grounded");
    expect(r.data.answer).toBe("'정답'은 2번 [1]");
    expect(r.data.sources).toEqual([{ label: "책 p.5", sourceId: "s1", chunkId: "c1", kind: "book", page: 5, snippet: expect.any(String) }]);
    expect(unitIdsSeen[0]).toEqual(["u1"]); // 단원에서 먼저 찾고(1건 < 2) 전체로 넓힌다
    expect(unitIdsSeen[1]).toBeNull();
    expect(captured.ctx).toContain("[자료]\n[1] (책 p.5)");
    expect(captured.ctx).toContain("1) b\n2) a (정답 — 학습자에게 아직 공개하지 말 것)");
    expect(captured.system).toContain("정답 번호나 정답 자체를 직접 말하지 말고");
    expect(st.logs[0]).toMatchObject({ questionId: "q", question: "왜?", answer: "'정답'은 2번 [1]" });
  });

  it("open: 검색하지 않고 일반 지식으로, 영어 지시", async () => {
    let sys = "";
    const { deps, st } = makeFakeDeps(member, { chat: (system) => { sys = system; return "answer"; } });
    const r = await chat(deps, { subjectId: "S", questionId: null, messages: ask("what?"), lang: "en" });
    expect(r.ok && r.data).toMatchObject({ mode: "open", sources: [] });
    expect(st.keywordCalls + st.hybridCalls).toBe(0);
    expect(sys).toContain("Answer in English");
  });

  it("모델 호출 실패는 오류로, 기록은 남기지 않는다", async () => {
    const { deps, st } = makeFakeDeps(member, { chat: () => { throw new Error("timeout"); } });
    expect(await chat(deps, { subjectId: "S", questionId: null, messages: ask("q") })).toEqual({ ok: false, error: "AI 호출 실패: timeout" });
    expect(st.logs).toHaveLength(0);
  });
});
