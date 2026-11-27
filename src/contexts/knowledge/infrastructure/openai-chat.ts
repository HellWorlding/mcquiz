import { env, hasOpenAI } from "@/shared/env";
import type { ChatModel } from "../application/ports";

/** OpenAI Responses API 로 답을 만든다. 키가 없으면 null (챗봇 꺼짐) */
export function openaiChat(): ChatModel | null {
  if (!hasOpenAI()) return null;
  return {
    async complete({ system, userContext, messages }) {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: env.openaiApiKey });
      const res = await client.responses.create({
        model: env.openaiModel,
        input: [
          { role: "system", content: system },
          { role: "user", content: userContext },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      return res.output_text ?? "";
    },
  };
}
