import { err, ok, type Result } from "@/shared/result";
import { parsePageRange } from "../domain/source";
import { message, requireAdmin } from "./guards";
import type { KnowledgeDeps } from "./ports";

const SIGNED_URL_SEC = 60 * 10;

export type FilePage = { fileId: string; storagePath: string; pageInFile: number | null };

/**
 * 교재 쪽수 page 가 든 PDF 파일과 파일 안의 쪽. 단원별로 잘린 파일(page_from~page_to)을 먼저, 없으면 통째 파일(page_offset).
 * page 가 null 이면 통째 파일만 (쪽 이동 없음). 권한은 RLS.
 */
export async function filePage(deps: KnowledgeDeps, subjectId: string, page: number | null): Promise<FilePage | null> {
  if (page !== null) {
    const part = await deps.files.findByPage(subjectId, page);
    if (part?.pageFrom) return { fileId: part.id, storagePath: part.storagePath, pageInFile: page - part.pageFrom + 1 };
  }
  const whole = await deps.files.findWhole(subjectId);
  if (whole) return { fileId: whole.id, storagePath: whole.storagePath, pageInFile: page !== null ? page + whole.pageOffset : null };
  return null;
}

/** 그 쪽을 여는 서명 URL (#page=N 포함). 파일이 없거나 URL 을 못 만들면 null */
export async function filePageUrl(deps: KnowledgeDeps, subjectId: string, page: number | null): Promise<string | null> {
  const target = await filePage(deps, subjectId, page);
  if (!target) return null;
  const signed = await deps.storage.signedUrl(target.storagePath, SIGNED_URL_SEC);
  if (!signed) return null;
  return target.pageInFile ? `${signed}#page=${target.pageInFile}` : signed;
}

/** 그 쪽이 든 단원 PDF 파일이 있나 (원문 보기에서 PDF 를 우선할지 결정) */
export async function hasFileForPage(deps: KnowledgeDeps, subjectId: string, page: number): Promise<boolean> {
  return !!(await deps.files.findByPage(subjectId, page));
}

/** 교재 PDF 를 통째로 올린다 (단원 파일이 없는 쪽수의 대비용). 관리자 */
export async function uploadWholeFile(deps: KnowledgeDeps, input: { subjectId: string; bytes: Uint8Array; name?: string; title: string; pageOffset?: number }): Promise<Result<{ storagePath: string }>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  try {
    const name = input.name ?? "book";
    const storagePath = `${input.subjectId}/${name}.pdf`;
    await deps.storage.upload(storagePath, input.bytes, "application/pdf");
    await deps.files.upsert({ subjectId: input.subjectId, unitId: null, name, title: input.title, storagePath, pageOffset: input.pageOffset ?? 0, pageFrom: null, pageTo: null, pages: null });
    return ok({ storagePath });
  } catch (e) {
    return err(message(e));
  }
}

export type SplitResult = { files: { key: string; title: string; from: number; to: number; storagePath: string; bytes: number }[]; skipped: string[]; removedWhole: string | null };

/**
 * 책 자료(kind=book)의 page_range 대로 교재 PDF 를 단원별로 잘라 올리고 files 에 등록한다.
 * 모든 범위를 잘랐으면 통째 파일을 지우고, 건너뛴 범위가 있으면 통째 파일을 남긴다. PDF 끝에서 잘린 범위는 실제 끝 쪽으로 기록한다.
 * pageOffset: 교재에 인쇄된 쪽수 + offset = PDF 쪽 번호. 관리자
 */
export async function splitBookFile(deps: KnowledgeDeps, input: { subjectId: string; bytes: Uint8Array; pageOffset?: number; onFile?: (f: SplitResult["files"][number]) => void }): Promise<Result<SplitResult>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  try {
    const offset = input.pageOffset ?? 0;
    const units = await deps.catalog.listUnits(input.subjectId);
    const books = (await deps.sources.booksWithRange(input.subjectId))
      .map((b) => {
        const r = parsePageRange(b.pageRange);
        const unit = units.find((u) => u.id === b.unitId) ?? null;
        return r ? { ...b, from: r.from, to: r.to, unitNo: unit?.no ?? null, unitTitle: unit?.title ?? b.title } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.from - b.from);
    if (books.length === 0) return err("책 자료(kind=book)에 page_range 가 없습니다. 먼저 책 텍스트를 올리세요.");
    const total = await deps.pdf.pageCount(input.bytes);
    const out: SplitResult = { files: [], skipped: [], removedWhole: null };
    for (const r of books) {
      const first = r.from + offset;
      const last = Math.min(r.to + offset, total);
      if (first < 1 || first > last) {
        out.skipped.push(`${r.unitTitle}: p.${r.from}-${r.to} 가 PDF 범위(1-${total}) 밖입니다. 건너뜀`);
        continue;
      }
      const bytes = await deps.pdf.slice(input.bytes, first, last);
      const key = r.unitNo !== null ? String(r.unitNo).padStart(3, "0") : r.id;
      const storagePath = `${input.subjectId}/book/${key}.pdf`;
      await deps.storage.upload(storagePath, bytes, "application/pdf");
      // PDF 가 자료 범위보다 짧으면 끝 쪽이 잘린다 → 실제로 자른 범위를 기록해야 filePage 의 쪽 계산이 맞다
      const to = last - offset;
      await deps.files.upsert({ subjectId: input.subjectId, unitId: r.unitId, name: `book:${key}`, title: r.unitTitle, storagePath, pageOffset: offset, pageFrom: r.from, pageTo: to, pages: last - first + 1 });
      const f = { key, title: r.unitTitle, from: r.from, to, storagePath, bytes: bytes.byteLength };
      out.files.push(f);
      input.onFile?.(f);
    }
    // 건너뛴 범위가 있거나 하나도 못 잘랐으면 통째 파일을 남긴다 (그 쪽수는 통째 파일로 연다)
    const whole = out.skipped.length === 0 && out.files.length > 0 ? await deps.files.findWhole(input.subjectId) : null;
    if (whole) {
      await deps.storage.remove([whole.storagePath]);
      await deps.files.delete(whole.id);
      out.removedWhole = whole.storagePath;
    }
    return ok(out);
  } catch (e) {
    return err(message(e));
  }
}
