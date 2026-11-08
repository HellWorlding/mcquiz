import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import type { Unit } from "@/domains/shared/types";
import { env, hasOpenAI } from "@/domains/shared/env";
import { emptyQuestion, type ParsedQuestion, type ParseResult } from "./types";

/**
 * OpenAI 는 선택 기능이다. OPENAI_API_KEY 가 없으면 이 파일의 함수는 모두 null/빈 결과를 돌려준다.
 *  - aiParseQuestions: 규칙 파서가 실패한 텍스트를 Structured Outputs 로 문항 배열로 바꾼다
 *  - aiClassifyUnit: 단원 목차 + 후보 단원 스크립트 요약을 주고 단원을 고른다
 */

function client() {
  return new OpenAI({ apiKey: env.openaiApiKey });
}

const AiQuestion = z.object({
  no: z.number().nullable(),
  prompt: z.string(),
  choices: z.array(z.object({ text: z.string(), explanation: z.string().nullable() })),
  correct_choice: z.number().nullable(),
  hint: z.string().nullable(),
  unit_no: z.number().nullable(),
});
const AiQuestions = z.object({ questions: z.array(AiQuestion) });

export async function aiParseQuestions(text: string): Promise<ParseResult | null> {
  if (!hasOpenAI()) return null;
  const res = await client().responses.parse({
    model: env.openaiModel,
    input: [
      {
        role: "system",
        content:
          "너는 객관식 문제지 텍스트를 구조화하는 도구다. 4지선다 또는 5지선다 문항을 찾아 질문, 선지(순서대로), 정답 번호(1부터, 모르면 null), 선지별 해설(있을 때만), 힌트, 단원 번호(예: [26강] → 26, 없으면 null)를 추출한다. 원문을 바꾸거나 요약하지 말고 그대로 옮겨라.",
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
}

const AiUnitPick = z.object({ unit_id: z.string().nullable(), confidence: z.number() });

export async function aiClassifyUnit(
  db: SupabaseClient<Database>,
  subjectId: string,
  units: Unit[],
  q: ParsedQuestion,
  candidateUnitIds: string[],
): Promise<{ unitId: string; confidence: number } | null> {
  if (!hasOpenAI()) return null;
  const toc = units.map((u) => `${u.id} | ${u.no ?? "-"} | ${u.title}`).join("\n");
  let excerpts = "";
  if (candidateUnitIds.length) {
    const { data } = await db
      .from("sources")
      .select("unit_id, content")
      .eq("subject_id", subjectId)
      .in("unit_id", candidateUnitIds);
    excerpts = (data ?? [])
      .map((s) => `## unit ${s.unit_id}\n${s.content.slice(0, 1500)}`)
      .join("\n\n");
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
}
