import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import { embedTexts, embeddingInput, embeddingModel, toVectorLiteral } from "./embed";

type Db = SupabaseClient<Database>;

export type EmbedProgress = { total: number; done: number; skipped: boolean; failed: string | null };

type Row = { id: string; source_id: string; subject_id: string; unit_id: string | null; ord: number; page: number | null; heading: string | null; content: string };

/**
 * 임베딩이 없는(또는 모델이 다른) 조각을 찾아 임베딩을 채운다. 업로드 직후(자료 하나)와 스크립트(과목 전체) 양쪽에서 쓴다.
 * budgetMs 를 넘기면 거기까지 하고 돌아온다 (서버 액션 시간 제한 때문). 다시 부르면 남은 것만 이어서 한다.
 */
export async function embedChunks(
  db: Db,
  filter: { subjectId: string } | { sourceId: string },
  opts: { budgetMs?: number; force?: boolean; onBatch?: (p: EmbedProgress) => void } = {},
): Promise<EmbedProgress> {
  const t0 = Date.now();
  const model = embeddingModel();
  const base = () => {
    let q = db.from("source_chunks").select("id, source_id, subject_id, unit_id, ord, page, heading, content");
    q = "sourceId" in filter ? q.eq("source_id", filter.sourceId) : q.eq("subject_id", filter.subjectId);
    if (!opts.force) q = q.or(`embedding.is.null,embedding_model.neq.${model}`);
    return q.order("source_id").order("ord");
  };
  // 전체 개수
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await base().range(from, from + 999);
    if (error) return { total: 0, done: 0, skipped: false, failed: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const total = rows.length;
  if (total === 0) return { total: 0, done: 0, skipped: false, failed: null };

  const sourceIds = [...new Set(rows.map((r) => r.source_id))];
  const titles = new Map<string, string>();
  for (let i = 0; i < sourceIds.length; i += 200) {
    const { data } = await db.from("sources").select("id, title").in("id", sourceIds.slice(i, i + 200));
    for (const s of data ?? []) titles.set(s.id, s.title);
  }

  let done = 0;
  const BATCH = 64;
  for (let i = 0; i < rows.length; i += BATCH) {
    if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break;
    const batch = rows.slice(i, i + BATCH);
    const vectors = await embedTexts(batch.map((r) => embeddingInput(titles.get(r.source_id) ?? "", r.heading, r.content)));
    if (vectors === null) return { total, done, skipped: true, failed: null };
    const now = new Date().toISOString();
    const { error } = await db.from("source_chunks").upsert(
      batch.map((r, k) => ({
        id: r.id,
        source_id: r.source_id,
        subject_id: r.subject_id,
        unit_id: r.unit_id,
        ord: r.ord,
        page: r.page,
        heading: r.heading,
        content: r.content,
        embedding: toVectorLiteral(vectors[k]),
        embedding_model: model,
        embedded_at: now,
      })),
      { onConflict: "id" },
    );
    if (error) return { total, done, skipped: false, failed: error.message };
    done += batch.length;
    opts.onBatch?.({ total, done, skipped: false, failed: null });
  }
  return { total, done, skipped: false, failed: null };
}

/** 자료 하나의 조각 임베딩 (업로드 직후). 실패해도 예외를 던지지 않는다 */
export async function embedSourceChunks(db: Db, sourceId: string, opts: { budgetMs?: number } = {}): Promise<EmbedProgress> {
  try {
    return await embedChunks(db, { sourceId }, opts);
  } catch (e) {
    return { total: 0, done: 0, skipped: false, failed: e instanceof Error ? e.message : String(e) };
  }
}
