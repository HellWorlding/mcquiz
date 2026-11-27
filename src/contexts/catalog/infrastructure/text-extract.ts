import type { TextExtractor } from "../application/ports";

/** html 태그를 벗겨 평문으로 (반입 파일용 최소 구현) */
function htmlToText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|nav|footer|noscript|svg)\b[\s\S]*?<\/\1>/gi, "");
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

/** txt/md/json 은 그대로, html 은 태그를 벗겨, pdf 는 페이지마다 "[p.N]" 표시를 넣어 텍스트로 만든다 */
export const extractText: TextExtractor = async (filename, bytes) => {
  if (/\.pdf$/i.test(filename)) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      const pages = result.pages ?? [];
      if (pages.length) return pages.map((p, i) => `[p.${p.num ?? i + 1}]\n${p.text}`).join("\n\n");
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  const raw = new TextDecoder("utf-8").decode(bytes);
  return /\.html?$/i.test(filename) ? htmlToText(raw) : raw;
};
