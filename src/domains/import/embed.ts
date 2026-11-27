import OpenAI from "openai";
import { env, hasOpenAI } from "@/domains/shared/env";

/**
 * 자료 조각 임베딩 (RAG). OpenAI 임베딩 모델을 쓰며, 키가 없으면 null 을 돌려주고 검색은 키워드만으로 돈다.
 * 모델·차원은 마이그레이션(source_chunks.embedding vector(3072))과 맞춰야 한다.
 * (server-only 를 붙이지 않는다: 로컬 스크립트 embed:chunks 도 이 파일을 쓴다)
 */
export const EMBEDDING_DIMS = 3072;
const BATCH = 64;
const MAX_CHARS = 20_000; // 8,191 토큰 상한 안쪽

export function embeddingModel(): string {
  return env.embeddingModel;
}

/** 조각을 임베딩할 때 넣는 글: 자료 제목·제목 경로를 앞에 붙여 맥락을 준다 (저장되는 content 는 그대로) */
export function embeddingInput(sourceTitle: string, heading: string | null, content: string): string {
  const head = [sourceTitle, heading].filter(Boolean).join(" > ");
  return head ? `${head}\n\n${content}` : content;
}

/** 여러 글을 한 번에 임베딩. 키가 없으면 null. 결과 순서는 입력 순서와 같다 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!hasOpenAI()) return null;
  if (texts.length === 0) return [];
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const model = embeddingModel();
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
}

export async function embedQuery(query: string): Promise<number[] | null> {
  const r = await embedTexts([query.slice(0, 4000)]);
  return r?.[0] ?? null;
}

/** pgvector 입력 문자열 */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/** 대략의 토큰 수 (한글 ≈ 1자 1토큰 남짓, 영어 ≈ 4자 1토큰) → 비용 어림용 */
export function estimateTokens(text: string): number {
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  return Math.round(hangul * 1.2 + (text.length - hangul) / 4);
}
