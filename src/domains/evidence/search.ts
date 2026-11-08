import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import { tokenize } from "@/domains/import/tokenize";

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

/**
 * 근거 검색: 해당 단원(스크립트+책)에서 먼저 찾고, 모자라면 주제 전체에서 찾는다.
 */
export async function findEvidence(
  db: Db,
  input: { subjectId: string; unitIds: string[] | null; query: string; limit?: number },
): Promise<EvidenceHit[]> {
  const limit = input.limit ?? 6;
  const tokens = tokenize(input.query);
  if (tokens.length === 0) return [];

  const run = async (unitIds: string[] | null, scope: "unit" | "all") => {
    const { data, error } = await db.rpc("search_chunks", {
      p_subject: input.subjectId,
      p_tokens: tokens,
      p_unit_ids: unitIds ?? undefined,
      p_limit: limit,
    });
    if (error || !data) return [] as EvidenceHit[];
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
