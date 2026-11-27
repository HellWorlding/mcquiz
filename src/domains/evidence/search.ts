import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import { tokenize } from "@/domains/import/tokenize";
import { embedQuery, toVectorLiteral } from "@/domains/import/embed";

type Db = SupabaseClient<Database>;

export type EvidenceHit = {
  chunkId: string;
  sourceId: string;
  unitId: string | null;
  unitNo: number | null;
  kind: string;
  sourceTitle: string;
  page: number | null;
  /** '40강 스크립트', '책 p.292' */
  label: string;
  content: string;
  /** 질의어 주변 발췌 */
  snippet: string;
  score: number;
  /** 단원 안에서 찾았는지, 전체에서 찾았는지 */
  scope: "unit" | "all";
  /** 웹 자료의 출처 주소 */
  url: string | null;
  /** 마크다운 제목 경로 */
  heading: string | null;
  /** 어떤 검색이 잡았는지: 벡터·키워드 순위 (하이브리드일 때만) */
  vecRank: number | null;
  kwRank: number | null;
};

export function sourceLabel(kind: string, unitNo: number | null, page: number | null, title: string): string {
  if (kind === "book") return page !== null ? `책 p.${page}` : `책 ${title}`;
  const name = kind === "script" ? "스크립트" : kind === "note" ? "노트" : "자료";
  return unitNo !== null ? `${unitNo}강 ${name}` : `${title} (${name})`;
}

/** 토큰이 처음 나오는 곳을 중심으로 발췌 */
export function makeSnippet(content: string, tokens: string[], width = 320): string {
  const text = content.replace(/\s+/g, " ").trim();
  let pos = -1;
  for (const t of tokens.sort((a, b) => b.length - a.length)) {
    const i = text.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
    if (pos >= 0 && pos < width / 2) break;
  }
  if (pos < 0) return text.slice(0, width) + (text.length > width ? "…" : "");
  const start = Math.max(0, pos - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

/** 과목에 임베딩된 조각이 하나라도 있나 (부분 인덱스로 즉시) */
export async function subjectHasEmbeddings(db: Db, subjectId: string): Promise<boolean> {
  const { data } = await db.from("source_chunks").select("id").eq("subject_id", subjectId).not("embedding", "is", null).limit(1);
  return !!data?.length;
}

/**
 * 근거 검색: 해당 단원(스크립트+책)에서 먼저 찾고, 모자라면 주제 전체에서 찾는다.
 * 과목에 임베딩이 있으면 벡터 + 키워드 하이브리드(match_chunks), 없으면 키워드(search_chunks).
 */
export async function findEvidence(
  db: Db,
  input: { subjectId: string; unitIds: string[] | null; query: string; limit?: number },
): Promise<EvidenceHit[]> {
  const limit = input.limit ?? 6;
  const tokens = tokenize(input.query);
  const embedding = (await subjectHasEmbeddings(db, input.subjectId)) ? await embedQuery(input.query).catch(() => null) : null;
  if (tokens.length === 0 && !embedding) return [];

  const run = async (unitIds: string[] | null, scope: "unit" | "all"): Promise<EvidenceHit[]> => {
    if (embedding) {
      const { data, error } = await db.rpc("match_chunks", {
        p_subject: input.subjectId,
        p_embedding: toVectorLiteral(embedding),
        p_tokens: tokens,
        p_unit_ids: unitIds ?? undefined,
        p_limit: limit,
      });
      if (error || !data) return [];
      return data.map((r) => ({
        chunkId: r.chunk_id,
        sourceId: r.source_id,
        unitId: r.unit_id,
        unitNo: r.unit_no,
        kind: r.kind,
        sourceTitle: r.source_title,
        page: r.page,
        label: sourceLabel(r.kind, r.unit_no, r.page, r.source_title),
        content: r.content,
        snippet: makeSnippet(r.content, [...tokens]),
        score: Number(r.score),
        scope,
        url: r.source_url,
        heading: r.heading,
        vecRank: r.vec_rank,
        kwRank: r.kw_rank,
      }));
    }
    const { data, error } = await db.rpc("search_chunks", {
      p_subject: input.subjectId,
      p_tokens: tokens,
      p_unit_ids: unitIds ?? undefined,
      p_limit: limit,
    });
    if (error || !data) return [];
    return data.map((r) => ({
      chunkId: r.chunk_id,
      sourceId: r.source_id,
      unitId: r.unit_id,
      unitNo: r.unit_no,
      kind: r.kind,
      sourceTitle: r.source_title,
      page: r.page,
      label: sourceLabel(r.kind, r.unit_no, r.page, r.source_title),
      content: r.content,
      snippet: makeSnippet(r.content, [...tokens]),
      score: Number(r.score),
      scope,
      url: null,
      heading: null,
      vecRank: null,
      kwRank: null,
    }));
  };

  let hits: EvidenceHit[] = [];
  if (input.unitIds && input.unitIds.length) hits = await run(input.unitIds, "unit");
  if (hits.length < Math.min(2, limit)) {
    const all = await run(null, "all");
    const seen = new Set(hits.map((h) => h.chunkId));
    hits = [...hits, ...all.filter((h) => !seen.has(h.chunkId))].slice(0, limit);
  }
  return hits;
}
