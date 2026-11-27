import type { Chunk, Source } from "../domain/source";
import type { SourceWithContent } from "./ports";
import type { KnowledgeDeps } from "./ports";

export async function listSources(deps: KnowledgeDeps, subjectId: string, unitId?: string | null): Promise<Source[]> {
  return deps.sources.list(subjectId, unitId ?? null);
}

export async function getSource(deps: KnowledgeDeps, id: string): Promise<Source | null> {
  const s = await deps.sources.byId(id);
  if (!s) return null;
  const { content: _content, ...rest } = s;
  void _content;
  return rest;
}

/** 자료 본문까지 (관리자 상세 화면) */
export async function getSourceWithContent(deps: KnowledgeDeps, id: string): Promise<SourceWithContent | null> {
  return deps.sources.byId(id);
}

/** 조각을 ord 순으로 읽는다. nextOrd 는 다음에 이어 읽을 ord (끝이면 null) */
export async function readChunks(deps: KnowledgeDeps, sourceId: string, fromOrd = 1, count = 10_000): Promise<{ chunks: Chunk[]; total: number; nextOrd: number | null }> {
  const { chunks, total } = await deps.chunks.list(sourceId, fromOrd, count);
  const last = chunks[chunks.length - 1];
  const nextOrd = last && chunks.length === count && last.ord < fromOrd + total - 1 ? last.ord + 1 : null;
  return { chunks, total, nextOrd };
}
