import { embeddingInput, toVectorLiteral, type EmbedProgress } from "../domain/embedding";
import type { KnowledgeDeps } from "./ports";

export type EmbedTarget = { subjectId: string } | { sourceId: string };
export type EmbedOptions = {
  /** 이 시간을 넘기면 거기까지 하고 돌아온다 (서버 액션 시간 제한). 0 또는 undefined 면 무제한 */
  budgetMs?: number;
  /** 이미 임베딩된 조각도 다시 */
  force?: boolean;
  onBatch?: (p: EmbedProgress) => void;
};

const BATCH = 64;

/**
 * K2. 임베딩이 없는(또는 모델이 다른) 조각을 찾아 임베딩을 채운다. 등록 직후(자료 하나)와 스크립트(과목 전체) 양쪽에서 쓴다.
 * 다시 부르면 남은 것만 이어서 한다. 임베딩 제공자가 없으면 skipped. 예외를 던지지 않는다.
 */
export async function embedPending(deps: KnowledgeDeps, target: EmbedTarget, opts: EmbedOptions = {}): Promise<EmbedProgress> {
  const t0 = deps.now().getTime();
  const provider = deps.embeddings;
  if (!provider) return { total: 0, done: 0, skipped: true, failed: null };
  try {
    const rows = await deps.chunks.listPending(target, provider.model, !!opts.force);
    const total = rows.length;
    if (total === 0) return { total: 0, done: 0, skipped: false, failed: null };
    const titles = await deps.sources.titlesByIds([...new Set(rows.map((r) => r.sourceId))]);
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (opts.budgetMs && deps.now().getTime() - t0 > opts.budgetMs) break;
      const batch = rows.slice(i, i + BATCH);
      const vectors = await provider.embed(batch.map((r) => embeddingInput(titles.get(r.sourceId) ?? "", r.heading, r.content)));
      await deps.chunks.saveEmbeddings(batch, vectors.map(toVectorLiteral), provider.model, deps.now().toISOString());
      done += batch.length;
      opts.onBatch?.({ total, done, skipped: false, failed: null });
    }
    return { total, done, skipped: false, failed: null };
  } catch (e) {
    return { total: 0, done: 0, skipped: false, failed: e instanceof Error ? e.message : String(e) };
  }
}

/** 임베딩 현황 (스크립트 출력용): 전체 조각, 현재 모델로 임베딩된 조각 */
export async function embedStatus(deps: KnowledgeDeps, subjectId: string): Promise<{ model: string | null; total: number; embedded: number }> {
  const model = deps.embeddings?.model ?? null;
  const [total, embedded] = await Promise.all([deps.chunks.countBySubject(subjectId), model ? deps.chunks.countBySubject(subjectId, model) : Promise.resolve(0)]);
  return { model, total, embedded };
}
