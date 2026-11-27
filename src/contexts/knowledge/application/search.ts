import { tokenize } from "@/shared/tokenize";
import { unitLabel } from "@/shared/labels";
import { err, ok, type Result } from "@/shared/result";
import { toVectorLiteral } from "../domain/embedding";
import { evidenceQuery, makeSnippet, mergeScopes, needsWiderSearch, pickChunkOnPage, searchMode, sourceLabel, type Evidence, type SearchHit } from "../domain/search";
import { message, requireUser } from "./guards";
import type { KnowledgeDeps, RawHit } from "./ports";

export type SearchInput = { subjectId: string; query: string; unitIds?: string[] | null; limit?: number };

function toHit(r: RawHit, tokens: string[], scope: "unit" | "all"): SearchHit {
  return {
    id: r.chunkId,
    sourceId: r.sourceId,
    ord: r.ord,
    page: r.page,
    heading: r.heading,
    content: r.content,
    sourceTitle: r.sourceTitle,
    sourceUrl: r.sourceUrl,
    kind: r.kind,
    unitId: r.unitId,
    unitNo: r.unitNo,
    score: Number(r.score),
    vecRank: r.vecRank,
    kwRank: r.kwRank,
    label: sourceLabel(r.kind, r.unitNo, r.page, r.sourceTitle),
    snippet: makeSnippet(r.content, tokens),
    scope,
  };
}

/** 질의 벡터. 임베딩 제공자가 없거나 실패하면 null → 키워드 검색 */
async function queryEmbedding(deps: KnowledgeDeps, query: string): Promise<number[] | null> {
  if (!deps.embeddings) return null;
  try {
    const v = await deps.embeddings.embed([query.slice(0, 4000)]);
    return v[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * 자료 검색: 지정한 단원에서 먼저 찾고, 모자라면 과목 전체에서 찾는다.
 * K3. 과목에 임베딩이 있으면 벡터 + 키워드 하이브리드(match_chunks), 없으면 키워드(search_chunks). K4 가시성은 RLS.
 */
export async function searchSources(deps: KnowledgeDeps, input: SearchInput): Promise<SearchHit[]> {
  const limit = input.limit ?? 6;
  const tokens = tokenize(input.query);
  const hasEmb = await deps.chunks.hasEmbeddings(input.subjectId);
  const embedding = hasEmb ? await queryEmbedding(deps, input.query) : null;
  const mode = searchMode(hasEmb, embedding);
  if (tokens.length === 0 && mode === "keyword") return [];

  const run = async (unitIds: string[] | null, scope: "unit" | "all"): Promise<SearchHit[]> => {
    try {
      const rows =
        mode === "hybrid" && embedding
          ? await deps.chunks.hybridSearch({ subjectId: input.subjectId, embedding: toVectorLiteral(embedding), tokens, unitIds, limit })
          : await deps.chunks.keywordSearch({ subjectId: input.subjectId, tokens, unitIds, limit });
      return rows.map((r) => toHit(r, tokens, scope));
    } catch {
      return [];
    }
  };

  let hits: SearchHit[] = [];
  if (input.unitIds && input.unitIds.length) hits = await run(input.unitIds, "unit");
  if (needsWiderSearch(hits.length, limit)) hits = mergeScopes(hits, await run(null, "all"), limit);
  return hits;
}

/** 문항의 정답 근거를 단원 자료(스크립트·책)에서 찾는다. 로그인 필요 */
export async function findEvidence(deps: KnowledgeDeps, questionId: string): Promise<Result<Evidence>> {
  const g = requireUser(deps);
  if (!g.ok) return g;
  try {
    const q = await deps.catalog.questionById(questionId);
    if (!q) return err("문항을 찾을 수 없습니다.");
    const correct = q.choices.find((c) => c.ord === q.correctChoice);
    const query = evidenceQuery({ topic: q.topic, prompt: q.prompt, correctText: correct?.text ?? null, sourceQuote: q.sourceQuote });
    let unitTitle: string | null = null;
    if (q.unitId) {
      const u = (await deps.catalog.listUnits(q.subjectId)).find((x) => x.id === q.unitId);
      if (u) unitTitle = unitLabel(u.no, u.title);
    }
    const hits = await searchSources(deps, { subjectId: q.subjectId, unitIds: q.unitId ? [q.unitId] : null, query, limit: 6 });
    return ok({ hits, unitTitle });
  } catch (e) {
    return err(message(e));
  }
}

export type LocateInput = { subjectId: string; unitId?: string | null; page?: number | null; text?: string | null };
export type LocateResult = { sourceId: string; chunkId: string; page: number | null } | null;

/**
 * "근거 · 책 p.N" 에서 원문 조각으로. 쪽수가 있으면 그 쪽의 조각(단원 일치·토큰 수로 고름),
 * 없으면 근거 문장으로 검색해 가장 가까운 조각.
 */
export async function locateChunk(deps: KnowledgeDeps, input: LocateInput): Promise<LocateResult> {
  if (input.page !== null && input.page !== undefined) {
    const onPage = await deps.chunks.byPage(input.subjectId, input.page, 30);
    const hit = pickChunkOnPage(onPage, input.unitId ?? null, input.text ? tokenize(input.text) : []);
    if (hit) return { sourceId: hit.sourceId, chunkId: hit.id, page: input.page };
  }
  if (input.text) {
    const hits = await searchSources(deps, { subjectId: input.subjectId, unitIds: input.unitId ? [input.unitId] : null, query: input.text, limit: 1 });
    if (hits[0]) return { sourceId: hits[0].sourceId, chunkId: hits[0].id, page: null };
  }
  return null;
}
