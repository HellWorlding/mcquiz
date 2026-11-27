import { err, ok, type Result } from "@/shared/result";
import { chunkText, extractSourceUrl } from "../domain/chunk";
import { embedNote } from "../domain/embedding";
import { pageRangeOf, titleFromFilename, type SourceKind } from "../domain/source";
import { looksLikeToc, parseToc, resolveUnitByFilename } from "../domain/toc";
import { embedPending } from "./embed";
import { message, requireAdmin } from "./guards";
import type { KnowledgeDeps } from "./ports";

export type RegisterInput = {
  subjectId: string;
  filename: string;
  bytes: Uint8Array;
  kind: SourceKind;
  /** 명시하면 파일명 추정보다 우선 */
  unitId?: string | null;
  /** 목차를 이 단원 아래에 만들거나, 파일명 번호를 이 단원의 자식과 맞출 때 */
  parentUnitId?: string | null;
  /** 임베딩에 쓸 시간 상한 (기본 40초). 0 이면 무제한 */
  embedBudgetMs?: number;
};

export type RegisterResult = {
  filename: string;
  status: "source" | "toc" | "skipped";
  sourceId?: string;
  unitTitle?: string | null;
  message: string;
};

const DEFAULT_EMBED_BUDGET_MS = 40_000;
const CHUNK_INSERT_BATCH = 200;

/**
 * 파일 하나를 자료로 등록한다: 추출 → 출처 url → (목차면 단원 생성) → 단원 연결 → K6 같은 제목 교체 → 조각(K1) → 임베딩.
 * 관리자만. 실패는 Result 의 error 또는 status "skipped" 로 돌려준다.
 */
export async function registerSource(deps: KnowledgeDeps, input: RegisterInput): Promise<Result<RegisterResult>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  try {
    const extracted = await deps.extractor.extract(input.filename, input.bytes);
    const { url, text } = extractSourceUrl(extracted.text);
    if (!text.trim()) return ok({ filename: input.filename, status: "skipped", message: "내용이 비어 있습니다." });

    if (looksLikeToc(input.filename, text)) {
      const rows = parseToc(text);
      if (rows.length === 0) return ok({ filename: input.filename, status: "skipped", message: "목차 형식을 읽지 못했습니다." });
      const r = await deps.catalog.ensureUnits(input.subjectId, rows, input.parentUnitId ?? null);
      return ok({ filename: input.filename, status: "toc", message: `단원 ${r.created}개 생성, ${r.skipped}개는 이미 있음` });
    }

    const units = await deps.catalog.listUnits(input.subjectId);
    let unitId = input.unitId ?? null;
    let unitTitle: string | null = null;
    if (!unitId) {
      const u = resolveUnitByFilename(input.filename, units, input.parentUnitId ?? null);
      if (u) {
        unitId = u.id;
        unitTitle = u.title;
      }
    } else unitTitle = units.find((u) => u.id === unitId)?.title ?? null;

    const title = titleFromFilename(input.filename);
    // K6. 같은 과목에 같은 제목의 자료가 이미 있으면 새 내용으로 바꾼다.
    // 새 자료와 조각을 모두 넣은 뒤에 옛 자료를 지운다 (조각은 FK cascade). 중간에 실패하면 새로 넣은 것만 지워 옛 자료를 남긴다.
    const dup = await deps.sources.idsByTitle(input.subjectId, title);

    const chunks = chunkText(text);
    const pages = chunks.map((c) => c.page).filter((p): p is number => p !== null);
    const range = extracted.pageRange ?? pageRangeOf(pages);
    const sourceId = await deps.sources.insert({ subjectId: input.subjectId, unitId, kind: input.kind, title, content: text, pageRange: range, url });
    try {
      for (let i = 0; i < chunks.length; i += CHUNK_INSERT_BATCH) {
        await deps.chunks.insertMany(chunks.slice(i, i + CHUNK_INSERT_BATCH).map((c) => ({ sourceId, subjectId: input.subjectId, unitId, ord: c.ord, page: c.page, heading: c.heading, content: c.content })));
      }
    } catch (e) {
      await deps.sources.deleteMany([sourceId]).catch(() => undefined);
      throw e;
    }
    const old = dup.filter((id) => id !== sourceId);
    if (old.length) await deps.sources.deleteMany(old);
    const budget = input.embedBudgetMs ?? DEFAULT_EMBED_BUDGET_MS;
    const progress = await embedPending(deps, { sourceId }, { budgetMs: budget > 0 ? budget : undefined });
    const pageNote = pages.length ? ` (p.${Math.min(...pages)}-${Math.max(...pages)})` : "";
    return ok({
      filename: input.filename,
      status: "source",
      sourceId,
      unitTitle,
      message: `${unitId ? `단원 "${unitTitle}" 에 연결` : "단원을 찾지 못해 연결하지 않음"} · 조각 ${chunks.length}개${pageNote}${embedNote(progress)}`,
    });
  } catch (e) {
    return err(message(e));
  }
}

/** 여러 파일을 순서대로 등록한다 (목차 파일 먼저). 파일 하나의 실패는 그 파일만 skipped 로 남긴다 */
export async function registerSources(deps: KnowledgeDeps, files: Omit<RegisterInput, "subjectId" | "kind" | "unitId" | "parentUnitId">[], common: Pick<RegisterInput, "subjectId" | "kind" | "unitId" | "parentUnitId" | "embedBudgetMs">): Promise<Result<RegisterResult[]>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const results: RegisterResult[] = [];
  for (const f of files) {
    const r = await registerSource(deps, { ...common, ...f });
    results.push(r.ok ? r.data : { filename: f.filename, status: "skipped", message: r.error });
  }
  return ok(results);
}

export async function deleteSource(deps: KnowledgeDeps, id: string): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  try {
    await deps.sources.deleteMany([id]);
    return ok(undefined);
  } catch (e) {
    return err(message(e));
  }
}
