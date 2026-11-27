import OpenAI from "openai";
import { env, hasOpenAI } from "@/shared/env";
import { EMBEDDING_DIMS } from "../domain/embedding";
import type { EmbeddingProvider } from "../application/ports";

const BATCH = 64;
const MAX_CHARS = 20_000; // 8,191 토큰 상한 안쪽

/**
 * OpenAI 임베딩 (기본 text-embedding-3-large, 3072차원). 키가 없으면 null 을 돌려주고 검색은 키워드만으로 돈다.
 * (server-only 를 붙이지 않는다: 로컬 스크립트도 쓴다)
 */
export function openaiEmbeddings(): EmbeddingProvider | null {
  if (!hasOpenAI()) return null;
  const model = env.embeddingModel;
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  return {
    model,
    async embed(texts) {
      if (texts.length === 0) return [];
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const input = texts.slice(i, i + BATCH).map((t) => t.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS) || " ");
        const res = await client.embeddings.create({
          model,
          input,
          // text-embedding-3 계열만 차원 지정을 받는다
          ...(model.startsWith("text-embedding-3") ? { dimensions: EMBEDDING_DIMS } : {}),
        });
        const sorted = [...res.data].sort((a, b) => a.index - b.index);
        for (const d of sorted) {
          if (d.embedding.length !== EMBEDDING_DIMS) throw new Error(`임베딩 차원이 ${d.embedding.length} 입니다 (기대 ${EMBEDDING_DIMS}). EMBEDDING_MODEL 을 확인하세요.`);
          out.push(d.embedding);
        }
      }
      return out;
    },
  };
}
