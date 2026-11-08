/** 자료 텍스트를 검색·인용 단위로 나눈다 (순수 함수) */
export type Chunk = { ord: number; page: number | null; content: string };

const PAGE_MARK = /\[p\.(\d+)\]/g;
const MAX_CHUNK = 1600;
const TARGET_CHUNK = 900;

/** 긴 글을 문단·문장 경계에서 TARGET_CHUNK 안팎으로 자른다 */
function splitLong(text: string, page: number | null, startOrd: number): Chunk[] {
  const out: Chunk[] = [];
  const paras = text.split(/\n{2,}|\n(?=\s*(?:\d+[.)]|[①-⑩]|[-•]))/).map((p) => p.trim()).filter(Boolean);
  let buf = "";
  const flush = () => {
    if (buf.trim()) out.push({ ord: startOrd + out.length, page, content: buf.trim() });
    buf = "";
  };
  for (const p of paras) {
    if (p.length > MAX_CHUNK) {
      flush();
      // 문장 단위로 더 쪼갠다
      const sentences = p.split(/(?<=[.!?。]|습니다|입니다|합니다|됩니다)\s+/);
      for (const s of sentences) {
        if (buf.length + s.length > TARGET_CHUNK && buf) flush();
        buf += (buf ? " " : "") + s;
      }
      flush();
      continue;
    }
    if (buf.length + p.length > TARGET_CHUNK && buf) flush();
    buf += (buf ? "\n" : "") + p;
  }
  flush();
  return out;
}

/**
 * 책: [p.N] 표시를 기준으로 쪽 단위. 쪽이 너무 길면 같은 쪽 번호로 더 나눈다.
 * 스크립트·노트: 쪽 표시가 없으면 문단 묶음 단위(page = null).
 */
export function chunkText(text: string): Chunk[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const marks = [...normalized.matchAll(PAGE_MARK)];
  if (marks.length === 0) return splitLong(normalized, null, 1);

  const out: Chunk[] = [];
  // 첫 표시 앞 머리말(제목 등)은 첫 쪽에 붙인다
  const head = normalized.slice(0, marks[0].index).trim();
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const page = +m[1];
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index! : normalized.length;
    let body = normalized.slice(start, end).trim();
    if (i === 0 && head) body = `${head}\n${body}`;
    if (!body) continue;
    if (body.length <= MAX_CHUNK) out.push({ ord: out.length + 1, page, content: body });
    else out.push(...splitLong(body, page, out.length + 1));
  }
  return out;
}
