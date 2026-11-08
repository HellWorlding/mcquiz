import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import type { Unit } from "@/domains/shared/types";
import { unitNoFromFilename } from "./parse-text";
import { chunkText } from "./chunk";

type Db = SupabaseClient<Database>;

export type TocRow = { no: number; title: string };

/** 목차 파일 여부: 파일명에 '목차' 가 있거나 첫 줄이 '차시<TAB>수업명' 처럼 생겼으면 목차 */
export function looksLikeToc(filename: string, text: string): boolean {
  if (/목차|toc|syllabus/i.test(filename)) return true;
  const first = text.split(/\r?\n/).find((l) => l.trim());
  return !!first && /^(차시|회차|번호|no\.?|강)\s*\t/i.test(first.trim());
}

/** 탭 구분 목차(차시 \t 수업명 …) 또는 "N강 제목" 줄 목록 → 단원 행 */
export function parseToc(text: string): TocRow[] {
  const rows: TocRow[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const cols = t.split(/\t+/).map((c) => c.trim());
    if (cols.length >= 2 && /^\d{1,3}$/.test(cols[0]) && cols[1]) {
      rows.push({ no: +cols[0], title: cols[1] });
      continue;
    }
    const m = /^\s*(?:제\s*)?(\d{1,3})\s*(?:강|차시|단원|과|회)[.)\]:\s-]*(.+)$/.exec(t);
    if (m) rows.push({ no: +m[1], title: m[2].trim() });
  }
  return rows;
}

export async function createUnitsFromToc(
  db: Db,
  subjectId: string,
  rows: TocRow[],
  parentId: string | null = null,
): Promise<{ created: number; skipped: number }> {
  if (rows.length === 0) return { created: 0, skipped: 0 };
  let q = db.from("units").select("no").eq("subject_id", subjectId);
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data: existing } = await q;
  const have = new Set((existing ?? []).map((u) => u.no));
  const fresh = rows.filter((r) => !have.has(r.no));
  if (fresh.length) {
    const { error } = await db.from("units").insert(
      fresh.map((r) => ({ subject_id: subjectId, parent_id: parentId, no: r.no, title: r.title, sort: r.no })),
    );
    if (error) throw new Error(error.message);
  }
  return { created: fresh.length, skipped: rows.length - fresh.length };
}

export type ExtractedFile = { text: string; pageRange: string | null };

/** txt/md 는 그대로, pdf 는 페이지마다 "[p.N]" 표시를 넣어 텍스트로 만든다 */
export async function extractText(filename: string, bytes: Uint8Array): Promise<ExtractedFile> {
  if (/\.pdf$/i.test(filename)) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      const pages = result.pages ?? [];
      if (pages.length) {
        const text = pages.map((p, i) => `[p.${p.num ?? i + 1}]\n${p.text}`).join("\n\n");
        return { text, pageRange: `1-${pages.length}` };
      }
      return { text: result.text, pageRange: result.total ? `1-${result.total}` : null };
    } finally {
      await parser.destroy();
    }
  }
  return { text: new TextDecoder("utf-8").decode(bytes), pageRange: null };
}

export type SourceUploadResult = {
  filename: string;
  status: "source" | "toc" | "skipped";
  unitTitle?: string | null;
  message: string;
};

/** 파일 하나를 sources 에 넣는다. 파일명에서 단원 번호를 찾아 연결한다. */
export async function importSourceFile(
  db: Db,
  input: {
    subjectId: string;
    filename: string;
    bytes: Uint8Array;
    kind: "script" | "note" | "book" | "other";
    units: Unit[];
    unitId?: string | null; // 명시적으로 지정하면 파일명 추정보다 우선
    parentUnitId?: string | null; // 목차를 이 단원 아래에 만들 때
  },
): Promise<SourceUploadResult> {
  const { text, pageRange } = await extractText(input.filename, input.bytes);
  if (!text.trim()) return { filename: input.filename, status: "skipped", message: "내용이 비어 있습니다." };

  if (looksLikeToc(input.filename, text)) {
    const rows = parseToc(text);
    if (rows.length === 0) return { filename: input.filename, status: "skipped", message: "목차 형식을 읽지 못했습니다." };
    const r = await createUnitsFromToc(db, input.subjectId, rows, input.parentUnitId ?? null);
    return { filename: input.filename, status: "toc", message: `단원 ${r.created}개 생성, ${r.skipped}개는 이미 있음` };
  }

  let unitId = input.unitId ?? null;
  let unitTitle: string | null = null;
  if (!unitId) {
    const no = unitNoFromFilename(input.filename);
    if (no !== null) {
      const hits = input.units.filter((u) => u.no === no);
      const u =
        (input.parentUnitId ? hits.find((x) => x.parent_id === input.parentUnitId) : null) ??
        hits.find((x) => x.parent_id === null) ??
        hits[0];
      if (u) {
        unitId = u.id;
        unitTitle = u.title;
      }
    }
  } else {
    unitTitle = input.units.find((u) => u.id === unitId)?.title ?? null;
  }

  const title = input.filename.replace(/\.[a-z0-9]+$/i, "");
  // 같은 이름의 자료가 이미 있으면 새 내용으로 바꾼다 (다시 올려도 중복되지 않게)
  const { data: dup } = await db.from("sources").select("id").eq("subject_id", input.subjectId).eq("title", title);
  if (dup && dup.length) await db.from("sources").delete().in("id", dup.map((d) => d.id));
  const chunks = chunkText(text);
  const pages = chunks.map((c) => c.page).filter((p): p is number => p !== null);
  const range = pageRange ?? (pages.length ? `${Math.min(...pages)}-${Math.max(...pages)}` : null);
  const { data: inserted, error } = await db
    .from("sources")
    .insert({ subject_id: input.subjectId, unit_id: unitId, kind: input.kind, title, content: text, page_range: range })
    .select("id")
    .single();
  if (error || !inserted) return { filename: input.filename, status: "skipped", message: error?.message ?? "저장 실패" };
  // 검색·인용용 조각 (책은 쪽 단위)
  for (let i = 0; i < chunks.length; i += 200) {
    const rows = chunks.slice(i, i + 200).map((c) => ({
      source_id: inserted.id,
      subject_id: input.subjectId,
      unit_id: unitId,
      ord: c.ord,
      page: c.page,
      content: c.content,
    }));
    const { error: cErr } = await db.from("source_chunks").insert(rows);
    if (cErr) return { filename: input.filename, status: "skipped", message: `조각 저장 실패: ${cErr.message}` };
  }
  return {
    filename: input.filename,
    status: "source",
    unitTitle,
    message: `${unitId ? `단원 "${unitTitle}" 에 연결` : "단원을 찾지 못해 연결하지 않음"} · 조각 ${chunks.length}개${pages.length ? ` (p.${Math.min(...pages)}-${Math.max(...pages)})` : ""}`,
  };
}
