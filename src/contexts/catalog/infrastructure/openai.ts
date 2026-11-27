import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { env, hasOpenAI } from "@/shared/env";
import type { AiParser } from "../application/ports";
import { emptyQuestion, type ParsedQuestion } from "../domain/import/types";

/**
 * OpenAI 어댑터 (선택 기능). OPENAI_API_KEY 가 없으면 null 을 돌려주고 application 은 AI 없이 동작한다.
 *  - parseQuestions: 규칙 파서가 실패한 텍스트를 Structured Outputs 로 문항 배열로 바꾼다
 *  - classifyUnit: 단원 목차 (+ 후보 단원 자료 발췌) 를 주고 단원을 고른다
 *
 * 후보 단원의 자료 발췌(knowledge.sources)는 다른 컨텍스트의 데이터라 여기서 직접 읽지 않는다.
 * 필요하면 조립 단계에서 `excerpts` 를 넘긴다 (Knowledge 공개 API 어댑터).
 */
export type UnitExcerptProvider = (subjectId: string, unitIds: string[]) => Promise<{ unitId: string; text: string }[]>;

const AiQuestion = z.object({
  no: z.number().nullable(),
  prompt: z.string(),
  choices: z.array(z.object({ text: z.string(), explanation: z.string().nullable() })),
  correct_choice: z.number().nullable(),
  explanation: z.string().nullable(),
  hint: z.string().nullable(),
  unit_no: z.number().nullable(),
});
const AiQuestions = z.object({ questions: z.array(AiQuestion) });
const AiUnitPick = z.object({ unit_id: z.string().nullable(), confidence: z.number() });

export function openAiParser(opts: { excerpts?: UnitExcerptProvider } = {}): AiParser | null {
  if (!hasOpenAI()) return null;
  const client = () => new OpenAI({ apiKey: env.openaiApiKey });
  return {
    async parseQuestions(text) {
      const res = await client().responses.parse({
        model: env.openaiModel,
        input: [
          {
            role: "system",
            content:
              "너는 객관식 문제지 텍스트를 구조화하는 도구다. 4지선다 또는 5지선다 문항을 찾아 질문, 선지(순서대로), 정답 번호(1부터, 모르면 null), 선지별 해설(있을 때만), 문항 전체 해설(explanation, 있을 때만), 힌트, 단원 번호(예: [26강] → 26, 없으면 null)를 추출한다. 원문을 바꾸거나 요약하지 말고 그대로 옮겨라.",
          },
          { role: "user", content: text.slice(0, 60_000) },
        ],
        text: { format: zodTextFormat(AiQuestions, "questions") },
      });
      const parsed = res.output_parsed;
      if (!parsed) return null;
      const questions: ParsedQuestion[] = parsed.questions.map((aq, i) => {
        const q = emptyQuestion(aq.no ?? i + 1);
        q.prompt = aq.prompt.trim();
        q.choices = aq.choices.map((c) => ({ text: c.text.trim(), explanation: c.explanation?.trim() || null }));
        q.correct = aq.correct_choice;
        q.explanation = aq.explanation?.trim() || null;
        q.hint = aq.hint?.trim() || null;
        q.unitHint = aq.unit_no;
        while (q.choices.length < 4) q.choices.push({ text: "(선지 없음)", explanation: null });
        if (q.choices.length > 5) q.choices = q.choices.slice(0, 5);
        if (q.correct !== null && (q.correct < 1 || q.correct > q.choices.length)) q.correct = null;
        if (q.correct === null) q.warnings.push("정답이 없습니다. 미리보기에서 지정하세요.");
        q.warnings.push("AI 가 파싱한 문항입니다. 원문과 대조하세요.");
        return q;
      });
      return { questions, warnings: [], format: "ai" };
    },
    async classifyUnit({ subjectId, units, question: q, candidateUnitIds }) {
      const toc = units.map((u) => `${u.id} | ${u.no ?? "-"} | ${u.title}`).join("\n");
      let excerpts = "";
      if (candidateUnitIds.length && opts.excerpts) {
        const list = await opts.excerpts(subjectId, candidateUnitIds);
        excerpts = list.map((s) => `## unit ${s.unitId}\n${s.text.slice(0, 1500)}`).join("\n\n");
      }
      const res = await client().responses.parse({
        model: env.openaiModel,
        input: [
          {
            role: "system",
            content:
              "문항이 어느 단원(unit)에 속하는지 고른다. 단원 목차(id | 번호 | 제목)와 후보 단원의 스크립트 일부가 주어진다. 가장 알맞은 unit_id 와 0~1 사이 확신도를 답한다. 확신이 없으면 unit_id 를 null 로 둔다.",
          },
          {
            role: "user",
            content: `# 단원 목차\n${toc}\n\n# 후보 단원 스크립트\n${excerpts || "(없음)"}\n\n# 문항\n${q.prompt}\n${q.choices.map((c, i) => `${i + 1}) ${c.text}`).join("\n")}`,
          },
        ],
        text: { format: zodTextFormat(AiUnitPick, "unit_pick") },
      });
      const pick = res.output_parsed;
      if (!pick?.unit_id || !units.some((u) => u.id === pick.unit_id)) return null;
      return { unitId: pick.unit_id, confidence: Math.max(0, Math.min(1, pick.confidence)) };
    },
  };
}
