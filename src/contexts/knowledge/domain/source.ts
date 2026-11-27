/** Knowledge 도메인: 자료(Source)·조각(Chunk) 타입과 순수 규칙 */
export type SourceKind = "script" | "note" | "book" | "doc" | "other";
export const SOURCE_KINDS: readonly SourceKind[] = ["script", "note", "book", "doc", "other"];

export type Source = {
  id: string;
  subjectId: string;
  unitId: string | null;
  kind: SourceKind;
  title: string;
  url: string | null;
  pageRange: string | null;
  createdAt: string;
  chunkCount?: number;
  embeddedCount?: number;
};

/** 저장된 조각 */
export type Chunk = {
  id: string;
  sourceId: string;
  ord: number;
  page: number | null;
  heading: string | null;
  content: string;
};

/** 문자열을 SourceKind 로 (모르면 기본값) */
export function toSourceKind(raw: string | null | undefined, fallback: SourceKind = "script"): SourceKind {
  return SOURCE_KINDS.find((k) => k === raw) ?? fallback;
}

/** 파일명에서 확장자를 떼어 자료 제목으로 */
export function titleFromFilename(filename: string): string {
  return filename.replace(/\.[a-z0-9]+$/i, "");
}

/** 조각들의 쪽 범위 "5-12" (쪽 표시가 없으면 null) */
export function pageRangeOf(pages: number[]): string | null {
  return pages.length ? `${Math.min(...pages)}-${Math.max(...pages)}` : null;
}

/** "5-12" → { from: 5, to: 12 } */
export function parsePageRange(range: string | null | undefined): { from: number; to: number } | null {
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(range ?? "");
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null;
}
