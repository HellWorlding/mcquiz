import { describe, expect, it } from "vitest";
import { buildChatPrompt, historyToMessages, lastUserMessage, orderChoices, questionContextText } from "./chat";
import { plainText } from "./plain";

describe("챗봇 프롬프트 (순수)", () => {
  it("선지는 화면 순서대로 1번부터 다시 번호를 매기고 정답을 표시한다", () => {
    const q = { prompt: "P", explanation: "E", correctChoice: 2, unitId: null, choices: [{ ord: 1, text: "a" }, { ord: 2, text: "b" }, { ord: 3, text: "c" }] };
    expect(questionContextText(q, true, [3, 2, 1])).toBe("문항: P\n1) c\n2) b (정답)\n3) a\n해설: E");
    expect(questionContextText(q, false)).toBe("문항: P\n1) a\n2) b (정답 — 학습자에게 아직 공개하지 말 것)\n3) c");
    expect(orderChoices(q.choices, [9, 9, 9]).map((c) => c.ord)).toEqual([1, 2, 3]);
  });
  it("grounded 는 [자료] 를, open 은 문항 맥락만 넣는다", () => {
    const g = buildChatPrompt({ mode: "grounded", lang: "ko", reveal: true, context: "C", passages: "" });
    expect(g.system).toContain("[자료]");
    expect(g.userContext).toBe("[문항 맥락]\nC\n\n[자료]\n(관련 자료를 찾지 못함)");
    const o = buildChatPrompt({ mode: "open", lang: "en", reveal: false, context: "", passages: "x" });
    expect(o.system).toContain("Answer in English");
    expect(o.system).toContain("정답 번호나 정답 자체를 직접 말하지 말고");
    expect(o.userContext).toBe("(문항 맥락 없음)");
  });
  it("lastUserMessage / historyToMessages", () => {
    expect(lastUserMessage([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])?.content).toBe("a");
    expect(lastUserMessage([])).toBeNull();
    expect(historyToMessages([{ question: "q1", answer: "**a1**" }, { question: "q2", answer: null }], plainText)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "'a1'" },
      { role: "user", content: "q2" },
    ]);
  });
});
