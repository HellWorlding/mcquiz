import "server-only";
import { unitLabel } from "@/shared/labels";
import { tokenize } from "@/shared/tokenize";
import { sourceLabel } from "../domain/search";
import { plainText } from "../domain/plain";
import type { Source } from "../domain/source";
import { aiMode, aiQuota } from "../application/chat";
import { filePageUrl, hasFileForPage } from "../application/files";
import { locateChunk } from "../application/search";
import { getSourceWithContent, listSources, readChunks } from "../application/sources";
import { sessionKnowledgeDeps } from "./deps";
import type { ChatQuestion, Turn } from "./components/ChatPanel";
import type { ReaderChunk } from "./components/SourceReader";

/** /admin/sources: 과목의 자료 목록 */
export async function loadSourcesAdmin(subjectId: string): Promise<Source[]> {
  return listSources(await sessionKnowledgeDeps(), subjectId);
}

/** /admin/sources/[id]: 자료 본문과 단원 라벨 */
export async function loadSourceDetail(id: string): Promise<{ source: Source; content: string; unitText: string | null } | null> {
  const deps = await sessionKnowledgeDeps();
  const s = await getSourceWithContent(deps, id);
  if (!s) return null;
  const { content, ...source } = s;
  const unit = s.unitId ? (await deps.catalog.listUnits(s.subjectId)).find((u) => u.id === s.unitId) : null;
  return { source, content, unitText: unit ? `${unit.no ?? ""} ${unit.title}` : null };
}

export type SourceReaderData = {
  label: string;
  title: string;
  kind: string;
  subjectId: string;
  subjectName: string | null;
  unitTitle: string | null;
  pageRange: string | null;
  chunks: ReaderChunk[];
  targetChunkId: string | null;
  tokens: string[];
};

/** /sources/[id]: 원문 보기 데이터. 권한은 RLS (없거나 못 보면 null) */
export async function loadSourceReader(id: string, params: { chunk?: string; page?: string; q?: string }): Promise<SourceReaderData | null> {
  const deps = await sessionKnowledgeDeps();
  const s = await getSourceWithContent(deps, id);
  if (!s) return null;
  const [{ chunks }, units, subjectName] = await Promise.all([readChunks(deps, id), deps.catalog.listUnits(s.subjectId), deps.catalog.subjectName(s.subjectId)]);
  const unit = s.unitId ? units.find((u) => u.id === s.unitId) ?? null : null;
  const pageNo = params.page && /^\d+$/.test(params.page) ? Number(params.page) : null;
  const target = (params.chunk && chunks.some((c) => c.id === params.chunk) ? params.chunk : null) ?? (pageNo !== null ? (chunks.find((c) => c.page === pageNo)?.id ?? null) : null);
  const targetPage = chunks.find((c) => c.id === target)?.page ?? pageNo;
  // 긴 토큰부터 최대 8개만 강조
  const tokens = params.q ? [...new Set(tokenize(params.q))].sort((a, b) => b.length - a.length).slice(0, 8) : [];
  return {
    label: sourceLabel(s.kind, unit?.no ?? null, s.kind === "book" ? targetPage : null, s.title),
    title: s.title,
    kind: s.kind,
    subjectId: s.subjectId,
    subjectName,
    unitTitle: unit ? unitLabel(unit.no, unit.title) : null,
    pageRange: s.pageRange,
    chunks: chunks.map((c) => ({ id: c.id, ord: c.ord, page: c.page, content: c.content })),
    targetChunkId: target,
    tokens,
  };
}

export type FindParams = { subject?: string; unit?: string; page?: string; text?: string };

function findQuery(p: FindParams): URLSearchParams {
  return new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1]));
}

/**
 * /sources/find: "근거 · 책 p.N" 에서 원문으로 가는 중간 경로. 보낼 곳(href)을 돌려준다. 못 찾으면 null.
 * 그 쪽이 든 교재 PDF 파일이 있으면 PDF 로, 아니면 쪽/근거 문장으로 찾은 조각으로.
 */
export async function locateSourceHref(p: FindParams): Promise<string | null> {
  if (!p.subject) return null;
  const deps = await sessionKnowledgeDeps();
  const page = p.page && /^\d+$/.test(p.page) ? Number(p.page) : null;
  if (page !== null && (await hasFileForPage(deps, p.subject, page))) return `/sources/pdf?${findQuery(p)}`;
  const q = p.text ? `&q=${encodeURIComponent(p.text.slice(0, 200))}` : "";
  const hit = await locateChunk(deps, { subjectId: p.subject, unitId: p.unit ?? null, page, text: p.text ?? null });
  if (!hit) return null;
  return `/sources/${hit.sourceId}?chunk=${hit.chunkId}${hit.page !== null ? `&page=${hit.page}` : ""}${q}`;
}

/**
 * /sources/pdf: 교재 PDF 를 교재 쪽수 자리로 여는 서명 URL. 파일이 없으면 텍스트 원문(/sources/find) 경로.
 * 권한은 저장소 RLS(과목 권한)가 결정한다.
 */
export async function pdfRedirectHref(p: FindParams): Promise<string> {
  const fallback = `/sources/find?${findQuery(p)}`;
  if (!p.subject) return "/";
  const deps = await sessionKnowledgeDeps();
  const page = p.page && /^\d+$/.test(p.page) ? Number(p.page) : null;
  return (await filePageUrl(deps, p.subject, page)) ?? fallback;
}

export type ChatPageData = {
  subjectId: string;
  subjectName: string;
  quota: Awaited<ReturnType<typeof aiQuota>>;
  mode: Awaited<ReturnType<typeof aiMode>>;
  aiEnabled: boolean;
  question: ChatQuestion | null;
  questionId: string | null;
  history: Turn[];
};

/** /chat: 페이지 초기 데이터. 로그인 사용자가 아니면 null (페이지가 requireUser 로 먼저 막는다) */
export async function loadChatPage(subjectId: string, subjectName: string, questionId: string | null): Promise<ChatPageData | null> {
  const deps = await sessionKnowledgeDeps();
  if (!deps.user) return null;
  const [quota, mode] = await Promise.all([aiQuota(deps, deps.user), aiMode(deps, subjectId)]);
  let question: ChatQuestion | null = null;
  let history: Turn[] = [];
  if (questionId) {
    const [past, q] = await Promise.all([deps.chatLogs.recentForQuestion(deps.user.id, questionId, 6), deps.catalog.questionById(questionId)]);
    history = past.flatMap((r): Turn[] => (r.answer ? [{ role: "user", content: r.question, saved: true }, { role: "assistant", content: plainText(r.answer), saved: true }] : [{ role: "user", content: r.question, saved: true }]));
    if (q) question = { prompt: q.prompt, explanation: q.explanation, choices: [...q.choices].sort((a, b) => a.ord - b.ord).map((c) => ({ ord: c.ord, text: c.text, correct: c.ord === q.correctChoice })) };
  }
  return { subjectId, subjectName, quota, mode, aiEnabled: deps.chatModel !== null, question, questionId: question ? questionId : null, history };
}
