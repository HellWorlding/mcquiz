import type { Db } from "@/shared/db/types";
import type { Chunk } from "../../domain/source";
import type { ChunkRepo, PendingChunk, RawHit } from "../../application/ports";

const PAGE = 1000;
const CHUNK_COLS = "id, source_id, subject_id, unit_id, ord, page, heading, content";

type ChunkRow = { id: string; source_id: string; subject_id: string; unit_id: string | null; ord: number; page: number | null; heading: string | null; content: string };
const toChunk = (r: ChunkRow): Chunk => ({ id: r.id, sourceId: r.source_id, ord: r.ord, page: r.page, heading: r.heading, content: r.content });
const toPending = (r: ChunkRow): PendingChunk => ({ id: r.id, sourceId: r.source_id, subjectId: r.subject_id, unitId: r.unit_id, ord: r.ord, page: r.page, heading: r.heading, content: r.content });

type MatchRow = { chunk_id: string; source_id: string; unit_id: string | null; page: number | null; ord: number; heading: string | null; content: string; kind: string; source_title: string; source_url: string | null; unit_no: number | null; score: number; vec_rank?: number | null; kw_rank?: number | null };
const toRawHit = (r: MatchRow): RawHit => ({
  chunkId: r.chunk_id,
  sourceId: r.source_id,
  unitId: r.unit_id ?? null,
  unitNo: r.unit_no ?? null,
  page: r.page ?? null,
  ord: r.ord,
  heading: r.heading ?? null,
  content: r.content,
  kind: r.kind,
  sourceTitle: r.source_title,
  sourceUrl: r.source_url ?? null,
  score: Number(r.score),
  vecRank: r.vec_rank ?? null,
  kwRank: r.kw_rank ?? null,
});

export function chunkRepo(db: Db): ChunkRepo {
  const t = () => db.schema("knowledge").from("chunks");
  return {
    async insertMany(rows) {
      if (rows.length === 0) return;
      const { error } = await t().insert(rows.map((c) => ({ source_id: c.sourceId, subject_id: c.subjectId, unit_id: c.unitId, ord: c.ord, page: c.page, heading: c.heading, content: c.content })));
      if (error) throw new Error(`조각 저장 실패: ${error.message}`);
    },
    async list(sourceId, fromOrd, count) {
      const { count: total, error: cErr } = await t().select("id", { count: "exact", head: true }).eq("source_id", sourceId);
      if (cErr) throw new Error(cErr.message);
      const out: Chunk[] = [];
      for (let from = 0; out.length < count; from += PAGE) {
        const to = Math.min(from + PAGE, count) - 1;
        const { data, error } = await t().select(CHUNK_COLS).eq("source_id", sourceId).gte("ord", fromOrd).order("ord").range(from, to);
        if (error) throw new Error(error.message);
        out.push(...(data ?? []).map(toChunk));
        if (!data || data.length < to - from + 1) break;
      }
      return { chunks: out, total: total ?? 0 };
    },
    async byPage(subjectId, page, limit) {
      const { data, error } = await t().select(CHUNK_COLS).eq("subject_id", subjectId).eq("page", page).order("ord").limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ ...toChunk(r), unitId: r.unit_id }));
    },
    async hasEmbeddings(subjectId) {
      // 부분 인덱스로 즉시
      const { data } = await t().select("id").eq("subject_id", subjectId).not("embedding", "is", null).limit(1);
      return !!data?.length;
    },
    async listPending(filter, model, force) {
      const base = () => {
        let q = t().select(CHUNK_COLS);
        q = "sourceId" in filter ? q.eq("source_id", filter.sourceId) : q.eq("subject_id", filter.subjectId);
        if (!force) q = q.or(`embedding.is.null,embedding_model.neq.${model}`);
        return q.order("source_id").order("ord");
      };
      const rows: PendingChunk[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await base().range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []).map(toPending));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    async saveEmbeddings(rows, vectors, model, atIso) {
      const { error } = await t().upsert(
        rows.map((r, k) => ({
          id: r.id,
          source_id: r.sourceId,
          subject_id: r.subjectId,
          unit_id: r.unitId,
          ord: r.ord,
          page: r.page,
          heading: r.heading,
          content: r.content,
          embedding: vectors[k],
          embedding_model: model,
          embedded_at: atIso,
        })),
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
    },
    async countBySubject(subjectId, model) {
      let q = t().select("id", { count: "exact", head: true }).eq("subject_id", subjectId);
      if (model) q = q.eq("embedding_model", model);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async hybridSearch({ subjectId, embedding, tokens, unitIds, limit }) {
      const { data, error } = await db.schema("knowledge").rpc("match_chunks", { p_subject: subjectId, p_embedding: embedding, p_tokens: tokens, p_unit_ids: unitIds ?? undefined, p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => toRawHit(r as MatchRow));
    },
    async keywordSearch({ subjectId, tokens, unitIds, limit }) {
      const { data, error } = await db.schema("knowledge").rpc("search_chunks", { p_subject: subjectId, p_tokens: tokens, p_unit_ids: unitIds ?? undefined, p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => toRawHit(r as MatchRow));
    },
  };
}
