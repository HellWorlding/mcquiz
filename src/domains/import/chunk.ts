/** 자료 텍스트를 검색·인용 단위로 나눈다 (순수 함수) */
export type Chunk = { ord: number; page: number | null; content: string; heading: string | null };

const PAGE_MARK = /\[p\.(\d+)\]/g;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const MAX_CHUNK = 2000;
const TARGET_CHUNK = 1200;

/** 마크다운 제목을 만나면 제목 경로("상위 > 하위")를 갱신한다. 조각마다 그 조각이 속한 제목 경로를 남겨 검색·임베딩 맥락으로 쓴다 */
class HeadingTrail {
  private levels: (string | null)[] = [];
  /** 제목 줄이면 경로를 갱신하고 true */
  consume(para: string): boolean {
    const m = HEADING.exec(para.split("\n")[0]);
    if (!m || para.includes("\n")) return false;
    const depth = m[1].length;
    this.levels.length = Math.min(this.levels.length, depth - 1);
    this.levels[depth - 1] = m[2].trim();
    return true;
  }
  get path(): string | null {
    const p = this.levels.filter((x): x is string => !!x).join(" > ");
    return p || null;
  }
}

/** 긴 글을 문단·문장 경계에서 TARGET_CHUNK 안팎으로 자른다. 마크다운 제목 앞에서는 항상 끊는다 */
function splitLong(text: string, page: number | null, startOrd: number): Chunk[] {
  const out: Chunk[] = [];
  const trail = new HeadingTrail();
  const paras = text.split(/\n{2,}|\n(?=\s*(?:\d+[.)]|[①-⑩]|[-•]|#{1,6}\s))/).map((p) => p.trim()).filter(Boolean);
  let buf = "";
  let bufHeading: string | null = null;
  const flush = () => {
    if (buf.trim()) out.push({ ord: startOrd + out.length, page, content: buf.trim(), heading: bufHeading });
    buf = "";
  };
  const append = (s: string, sep: string) => {
    if (!buf) bufHeading = trail.path;
    buf += (buf ? sep : "") + s;
  };
  for (const p of paras) {
    if (trail.consume(p)) {
      // 제목은 다음 조각의 머리로 간다 (조각이 제목 경계를 넘지 않게)
      flush();
      append(p, "\n");
      continue;
    }
    if (p.length > MAX_CHUNK) {
      flush();
      // 문장 단위로 더 쪼갠다
      const sentences = p.split(/(?<=[.!?。]|습니다|입니다|합니다|됩니다)\s+/);
      for (const s of sentences) {
        if (buf.length + s.length > TARGET_CHUNK && buf) flush();
        append(s, " ");
      }
      flush();
      continue;
    }
    if (buf.length + p.length > TARGET_CHUNK && buf) flush();
    append(p, "\n");
  }
  flush();
  return out;
}

/**
 * 책: [p.N] 표시를 기준으로 쪽 단위. 쪽이 너무 길면 같은 쪽 번호로 더 나눈다.
 * 스크립트·노트·문서: 쪽 표시가 없으면 문단 묶음 단위(page = null), 마크다운 제목 경로를 heading 에 남긴다.
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
    if (body.length <= MAX_CHUNK) out.push({ ord: out.length + 1, page, content: body, heading: null });
    else out.push(...splitLong(body, page, out.length + 1));
  }
  return out;
}

/** HTML 을 마크다운 비슷한 평문으로 (제목은 # 로 남겨 heading 경로에 쓰인다) */
export function htmlToText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|nav|footer|noscript|svg)\b[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lv: string, body: string) => `\n\n${"#".repeat(+lv)} ${body.replace(/<[^>]+>/g, "").trim()}\n\n`);
  s = s.replace(/<(pre|code)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, body: string) => body);
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<\/(p|div|li|ul|ol|tr|table|blockquote|section|article|h[1-6])>/gi, "\n\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/t[dh]>/gi, " \t");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(+n));
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 문서 머리의 출처 주소를 찾는다: YAML 머리말(url:/source:) 또는 첫 5줄 안의 "URL: https://…", "출처: https://…", "<!-- url: … -->".
 * 머리말은 본문에서 떼어 돌려준다.
 */
export function extractSourceUrl(text: string): { url: string | null; text: string } {
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    const m = /^(?:url|source|출처)\s*:\s*<?(https?:\/\/\S+?)>?\s*$/im.exec(fm[1]);
    return { url: m ? m[1] : null, text: text.slice(fm[0].length) };
  }
  const head = text.split("\n").slice(0, 5).join("\n");
  const m = /^(?:<!--\s*)?(?:url|source|출처)\s*:\s*<?(https?:\/\/\S+?)>?\s*(?:-->)?\s*$/im.exec(head);
  if (!m) return { url: null, text };
  return { url: m[1], text: text.replace(m[0], "").replace(/^\n+/, "") };
}
