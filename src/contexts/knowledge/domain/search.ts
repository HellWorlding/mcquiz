import type { Chunk, SourceKind } from "./source";

/** 검색 결과 한 건: 조각 + 자료·단원 정보 + 점수·순위 + 화면용 라벨·발췌 */
export type SearchHit = Chunk & {
  sourceTitle: string;
  sourceUrl: string | null;
  kind: SourceKind | string;
  unitId: string | null;
  unitNo: number | null;
  score: number;
  /** 어떤 검색이 잡았는지: 벡터·키워드 순위 (하이브리드일 때만) */
  vecRank: number | null;
  kwRank: number | null;
  /** '40강 스크립트', '책 p.292' */
  label: string;
  /** 질의어 주변 발췌 */
  snippet: string;
  /** 단원 안에서 찾았는지, 전체에서 찾았는지 */
  scope: "unit" | "all";
};

export type Evidence = { hits: SearchHit[]; unitTitle: string | null };

export type SearchMode = "hybrid" | "keyword";

/** K3. 과목에 임베딩된 조각이 하나라도 있으면 하이브리드, 없으면 키워드 검색 */
export function searchMode(hasEmbeddings: boolean, queryEmbedding: number[] | null): SearchMode {
  return hasEmbeddings && queryEmbedding !== null ? "hybrid" : "keyword";
}

export function sourceLabel(kind: string, unitNo: number | null, page: number | null, title: string): string {
  if (kind === "book") return page !== null ? `책 p.${page}` : `책 ${title}`;
  const name = kind === "script" ? "스크립트" : kind === "note" ? "노트" : "자료";
  return unitNo !== null ? `${unitNo}강 ${name}` : `${title} (${name})`;
}

/** 토큰이 처음 나오는 곳을 중심으로 발췌 */
export function makeSnippet(content: string, tokens: string[], width = 320): string {
  const text = content.replace(/\s+/g, " ").trim();
  let pos = -1;
  for (const t of [...tokens].sort((a, b) => b.length - a.length)) {
    const i = text.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
    if (pos >= 0 && pos < width / 2) break;
  }
  if (pos < 0) return text.slice(0, width) + (text.length > width ? "…" : "");
  const start = Math.max(0, pos - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

export type RrfRow = { id: string; score: number; vecRank: number | null; kwRank: number | null };

/**
 * RRF(Reciprocal Rank Fusion). knowledge.match_chunks 의 SQL 과 같은 정의:
 * score = Σ 1/(k + rank), 순위는 1부터. 정렬은 score 내림차순 → vecRank(null 뒤) → kwRank(null 뒤).
 */
export function fuseRrf(vecIds: string[], kwIds: string[], k = 60): RrfRow[] {
  const rows = new Map<string, RrfRow>();
  vecIds.forEach((id, i) => rows.set(id, { id, score: 1 / (k + i + 1), vecRank: i + 1, kwRank: null }));
  kwIds.forEach((id, i) => {
    const r = rows.get(id);
    if (r) {
      r.score += 1 / (k + i + 1);
      r.kwRank = i + 1;
    } else rows.set(id, { id, score: 1 / (k + i + 1), vecRank: null, kwRank: i + 1 });
  });
  const nullsLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
  return [...rows.values()].sort((a, b) => b.score - a.score || nullsLast(a.vecRank, b.vecRank) || nullsLast(a.kwRank, b.kwRank));
}

/** 단원 안 결과가 모자라면 전체 결과로 채운다 (중복 제외, limit 안에서) */
export function mergeScopes(unitHits: SearchHit[], allHits: SearchHit[], limit: number): SearchHit[] {
  const seen = new Set(unitHits.map((h) => h.id));
  return [...unitHits, ...allHits.filter((h) => !seen.has(h.id))].slice(0, limit);
}

/** 단원 결과만으로 충분한가 (옛 규칙: min(2, limit) 개 미만이면 전체에서 더 찾는다) */
export function needsWiderSearch(unitHitCount: number, limit: number): boolean {
  return unitHitCount < Math.min(2, limit);
}

/** 문항 → 근거 질의문 (주제어 + 문제 + 정답 선지 + 근거 인용) */
export function evidenceQuery(q: { topic: string | null; prompt: string; correctText: string | null; sourceQuote: string | null }): string {
  return [q.topic ?? "", q.prompt, q.correctText ?? "", q.sourceQuote ?? ""].join(" ");
}

/** 같은 쪽의 조각이 여럿일 때 고르기: 단원이 맞고(1000점), 근거 문장의 단어가 가장 많이 든 조각 */
export function pickChunkOnPage<C extends { unitId: string | null; content: string }>(chunks: C[], unitId: string | null, tokens: string[]): C | null {
  if (chunks.length === 0) return null;
  const score = (c: C) => (unitId && c.unitId === unitId ? 1000 : 0) + tokens.filter((tk) => c.content.includes(tk)).length;
  return [...chunks].sort((a, b) => score(b) - score(a))[0];
}
