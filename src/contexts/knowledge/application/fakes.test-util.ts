/** 테스트용 인메모리 포트 구현 (application 테스트 전용) */
import type { CurrentUser } from "@/contexts/access";
import type { Chunk, Source } from "../domain/source";
import type { CatalogPort, ChatLogRepo, ChunkRepo, FileRepo, FileStorage, KnowledgeDeps, NewChunk, PendingChunk, QuestionRef, RawHit, SourceWithContent, SubjectFile, UnitRef } from "./ports";

export const admin: CurrentUser = { id: "admin", email: "a@x", displayName: null, isAdmin: true, aiLimit: null };
export const member: CurrentUser = { id: "u1", email: "u@x", displayName: null, isAdmin: false, aiLimit: null };

export type FakeState = {
  sources: Map<string, SourceWithContent>;
  chunks: Map<string, PendingChunk & { embedding: string | null; model: string | null }>;
  files: Map<string, SubjectFile>;
  storage: Map<string, Uint8Array>;
  logs: { userId: string; subjectId: string; questionId: string | null; question: string; answer: string; createdAt: string }[];
  units: UnitRef[];
  questions: Map<string, QuestionRef>;
  hybridCalls: number;
  keywordCalls: number;
  /** 검색 결과를 미리 정해 둔다 (unitIds 가 null 이면 "all") */
  hitsFor: (unitIds: string[] | null) => RawHit[];
};

let seq = 0;
const nextId = (p: string) => `${p}${++seq}`;

export function makeFakeDeps(user: CurrentUser | null, opts: { embeddings?: boolean; chat?: (system: string, ctx: string) => string; now?: Date; hasEmbeddings?: boolean } = {}) {
  const now = opts.now ?? new Date("2026-11-28T12:00:00Z");
  const st: FakeState = { sources: new Map(), chunks: new Map(), files: new Map(), storage: new Map(), logs: [], units: [], questions: new Map(), hybridCalls: 0, keywordCalls: 0, hitsFor: () => [] };
  const toChunk = (c: PendingChunk): Chunk => ({ id: c.id, sourceId: c.sourceId, ord: c.ord, page: c.page, heading: c.heading, content: c.content });
  const chunks: ChunkRepo = {
    insertMany: async (rows: NewChunk[]) => rows.forEach((r) => { const id = nextId("c"); st.chunks.set(id, { ...r, id, embedding: null, model: null }); }),
    list: async (sourceId, fromOrd, count) => {
      const all = [...st.chunks.values()].filter((c) => c.sourceId === sourceId).sort((a, b) => a.ord - b.ord);
      return { chunks: all.filter((c) => c.ord >= fromOrd).slice(0, count).map(toChunk), total: all.length };
    },
    byPage: async (subjectId, page, limit) => [...st.chunks.values()].filter((c) => c.subjectId === subjectId && c.page === page).sort((a, b) => a.ord - b.ord).slice(0, limit).map((c) => ({ ...toChunk(c), unitId: c.unitId })),
    hasEmbeddings: async (subjectId) => opts.hasEmbeddings ?? [...st.chunks.values()].some((c) => c.subjectId === subjectId && c.embedding !== null),
    listPending: async (filter, model, force) =>
      [...st.chunks.values()]
        .filter((c) => ("sourceId" in filter ? c.sourceId === filter.sourceId : c.subjectId === filter.subjectId))
        .filter((c) => force || c.embedding === null || c.model !== model)
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.ord - b.ord),
    saveEmbeddings: async (rows, vectors, model) => rows.forEach((r, i) => { const c = st.chunks.get(r.id)!; c.embedding = vectors[i]; c.model = model; }),
    countBySubject: async (subjectId, model) => [...st.chunks.values()].filter((c) => c.subjectId === subjectId && (!model || c.model === model)).length,
    hybridSearch: async ({ unitIds }) => { st.hybridCalls++; return st.hitsFor(unitIds); },
    keywordSearch: async ({ unitIds }) => { st.keywordCalls++; return st.hitsFor(unitIds); },
  };
  const strip = (s: SourceWithContent): Source => { const { content: _c, ...rest } = s; void _c; return rest; };
  const deps: KnowledgeDeps = {
    user,
    now: () => now,
    sources: {
      list: async (subjectId, unitId) => [...st.sources.values()].filter((s) => s.subjectId === subjectId && (!unitId || s.unitId === unitId)).map(strip),
      byId: async (id) => st.sources.get(id) ?? null,
      idsByTitle: async (subjectId, title) => [...st.sources.values()].filter((s) => s.subjectId === subjectId && s.title === title).map((s) => s.id),
      insert: async (input) => { const id = nextId("s"); st.sources.set(id, { ...input, id, createdAt: now.toISOString() }); return id; },
      deleteMany: async (ids) => ids.forEach((id) => { st.sources.delete(id); for (const [cid, c] of st.chunks) if (c.sourceId === id) st.chunks.delete(cid); }),
      countBySubject: async (subjectId) => [...st.sources.values()].filter((s) => s.subjectId === subjectId).length,
      titlesByIds: async (ids) => new Map(ids.map((id) => [id, st.sources.get(id)?.title ?? ""])),
      booksWithRange: async (subjectId) => [...st.sources.values()].filter((s) => s.subjectId === subjectId && s.kind === "book" && s.pageRange).map((s) => ({ id: s.id, title: s.title, unitId: s.unitId, pageRange: s.pageRange! })),
    },
    chunks,
    files: {
      byId: async (id) => st.files.get(id) ?? null,
      findByPage: async (subjectId, page) => [...st.files.values()].filter((f) => f.subjectId === subjectId && f.pageFrom !== null && f.pageTo !== null && f.pageFrom <= page && f.pageTo >= page).sort((a, b) => a.pageFrom! - b.pageFrom!)[0] ?? null,
      findWhole: async (subjectId) => [...st.files.values()].find((f) => f.subjectId === subjectId && f.name === "book") ?? null,
      upsert: async (f) => { const cur = [...st.files.values()].find((x) => x.subjectId === f.subjectId && x.name === f.name); const id = cur?.id ?? nextId("f"); st.files.set(id, { ...f, id }); },
      delete: async (id) => void st.files.delete(id),
    } satisfies FileRepo,
    storage: {
      signedUrl: async (path) => (st.storage.has(path) ? `https://signed/${path}` : null),
      upload: async (path, bytes) => void st.storage.set(path, bytes),
      remove: async (paths) => paths.forEach((p) => st.storage.delete(p)),
    } satisfies FileStorage,
    extractor: { extract: async (filename, bytes) => ({ text: new TextDecoder().decode(bytes), pageRange: /\.pdf$/i.test(filename) ? "1-3" : null }) },
    pdf: { pageCount: async () => 10, slice: async (_b, first, last) => new Uint8Array(last - first + 1) },
    embeddings: opts.embeddings ? { model: "fake-model", embed: async (texts) => texts.map((_, i) => [i, 0.5]) } : null,
    chatModel: opts.chat ? { complete: async ({ system, userContext }) => opts.chat!(system, userContext) } : null,
    chatLogs: {
      insert: async (row) => void st.logs.push({ ...row, createdAt: now.toISOString() }),
      timestampsSince: async (userId, since) => st.logs.filter((l) => l.userId === userId && l.createdAt >= since).map((l) => l.createdAt),
      recentForQuestion: async (userId, questionId, limit) => st.logs.filter((l) => l.userId === userId && l.questionId === questionId).slice(-limit).map((l) => ({ question: l.question, answer: l.answer })),
    } satisfies ChatLogRepo,
    catalog: {
      questionById: async (id) => st.questions.get(id) ?? null,
      listUnits: async (subjectId) => st.units.filter(() => !!subjectId),
      subjectName: async () => "과목",
      ensureUnits: async (subjectId, rows, parentId) => {
        const have = new Set(st.units.filter((u) => u.parentId === parentId).map((u) => u.no));
        const fresh = rows.filter((r) => !have.has(r.no));
        fresh.forEach((r) => st.units.push({ id: nextId("u"), no: r.no, title: r.title, parentId }));
        return { created: fresh.length, skipped: rows.length - fresh.length };
      },
    } satisfies CatalogPort,
  };
  return { deps, st };
}

export const rawHit = (chunkId: string, over: Partial<RawHit> = {}): RawHit => ({
  chunkId, sourceId: "s1", unitId: null, unitNo: 3, page: null, ord: 1, heading: null, content: `본문 ${chunkId} 교원연수`, kind: "script", sourceTitle: "31강", sourceUrl: null, score: 0.03, vecRank: 1, kwRank: null, ...over,
});

export const bytes = (s: string) => new TextEncoder().encode(s);
