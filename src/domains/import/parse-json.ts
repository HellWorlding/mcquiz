import { z } from "zod";
import { emptyQuestion, type ParsedQuestion, type ParseResult } from "./types";

const choiceSchema = z.union([
  z.string(),
  z.object({
    ord: z.number().int().optional(),
    text: z.string(),
    explanation: z.string().nullable().optional(),
  }),
]);

const questionSchema = z.object({
  no: z.number().int().optional(),
  prompt: z.string().optional(),
  question: z.string().optional(),
  choice_count: z.number().int().optional(),
  correct_choice: z.number().int().nullable().optional(),
  correct: z.number().int().nullable().optional(),
  answer: z.union([z.number().int(), z.string()]).nullable().optional(),
  choices: z.array(choiceSchema),
  explanation: z.string().nullable().optional(),
  hint: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  points: z.number().nullable().optional(),
  lecture_no: z.number().int().nullable().optional(),
  unit_no: z.number().int().nullable().optional(),
  unit: z.union([z.number().int(), z.string()]).nullable().optional(),
  topic: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  trap_types: z.array(z.string()).nullable().optional(),
  source_quote: z.string().nullable().optional(),
});

const DIFFICULTIES = new Set(["easy", "medium", "hard", "very_hard"]);
const DIFFICULTY_ALIASES: Record<string, "easy" | "medium" | "hard" | "very_hard"> = {
  하: "easy", 쉬움: "easy", 중: "medium", 보통: "medium", 상: "hard", 어려움: "hard", 최상: "very_hard", 매우어려움: "very_hard",
};

const fileSchema = z.union([
  z.array(questionSchema),
  z.object({ questions: z.array(questionSchema), unit_no: z.number().int().optional(), lecture_no: z.number().int().optional() }),
]);

export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return (t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"));
}

export function parseJsonQuestions(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { questions: [], warnings: [`JSON 파싱 실패: ${(e as Error).message}`], format: "none" };
  }
  const parsed = fileSchema.safeParse(data);
  if (!parsed.success) {
    return { questions: [], warnings: [`JSON 형식이 맞지 않습니다: ${parsed.error.issues[0]?.message ?? ""}`], format: "none" };
  }
  const fileUnit = Array.isArray(parsed.data) ? null : (parsed.data.unit_no ?? parsed.data.lecture_no ?? null);
  const list = Array.isArray(parsed.data) ? parsed.data : parsed.data.questions;
  const questions: ParsedQuestion[] = list.map((item, i) => {
    const q = emptyQuestion(item.no ?? i + 1);
    q.prompt = (item.prompt ?? item.question ?? "").trim();
    const choices = item.choices
      .map((c, idx) =>
        typeof c === "string"
          ? { ord: idx + 1, text: c, explanation: null }
          : { ord: c.ord ?? idx + 1, text: c.text, explanation: c.explanation ?? null },
      )
      .sort((a, b) => a.ord - b.ord);
    q.choices = choices.map((c) => ({ text: c.text.trim(), explanation: c.explanation?.trim() || null }));
    let correct: number | null = item.correct_choice ?? item.correct ?? null;
    if (correct === null && item.answer !== null && item.answer !== undefined) {
      const n = typeof item.answer === "number" ? item.answer : parseInt(item.answer, 10);
      correct = Number.isFinite(n) ? n : null;
    }
    q.correct = correct;
    q.explanation = item.explanation?.trim() || null;
    q.hint = item.hint?.trim() || q.hint;
    q.tags = item.tags ?? [];
    q.points = item.points ?? null;
    q.topic = item.topic?.trim() || null;
    const d = item.difficulty?.trim().toLowerCase();
    q.difficulty = d ? (DIFFICULTIES.has(d) ? (d as typeof q.difficulty) : (DIFFICULTY_ALIASES[d] ?? null)) : null;
    if (d && q.difficulty === null) q.warnings.push(`난이도 "${item.difficulty}" 를 알 수 없어 비웠습니다 (easy/medium/hard/very_hard).`);
    q.trapTypes = (item.trap_types ?? []).map((t) => t.trim()).filter(Boolean);
    q.sourceQuote = item.source_quote?.trim() || null;
    const unitRaw = item.lecture_no ?? item.unit_no ?? (typeof item.unit === "number" ? item.unit : null) ?? fileUnit;
    q.unitHint = unitRaw ?? null;
    if (typeof item.unit === "string") {
      const m = /(\d{1,3})/.exec(item.unit);
      if (m && q.unitHint === null) q.unitHint = +m[1];
    }
    if (q.choices.length < 4) {
      q.warnings.push(`선지가 ${q.choices.length}개뿐입니다.`);
      while (q.choices.length < 4) q.choices.push({ text: "(선지 없음)", explanation: null });
    }
    if (q.choices.length > 5) {
      q.warnings.push("선지가 5개를 넘어 5개까지만 저장됩니다.");
      q.choices = q.choices.slice(0, 5);
    }
    if (q.correct !== null && (q.correct < 1 || q.correct > q.choices.length)) {
      q.warnings.push(`정답 번호(${q.correct})가 범위를 벗어납니다.`);
      q.correct = null;
    }
    if (q.correct === null) q.warnings.push("정답이 없습니다. 미리보기에서 지정하세요.");
    return q;
  });
  return { questions, warnings: [], format: "json" };
}
