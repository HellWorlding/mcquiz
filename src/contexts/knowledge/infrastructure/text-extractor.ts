import { htmlToText } from "../domain/chunk";
import type { TextExtractor } from "../application/ports";

/** txt/md 는 그대로, html 은 태그를 벗겨 평문으로, pdf 는 페이지마다 "[p.N]" 표시를 넣어 텍스트로 만든다 */
export const textExtractor: TextExtractor = {
  async extract(filename, bytes) {
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
    const raw = new TextDecoder("utf-8").decode(bytes);
    if (/\.html?$/i.test(filename)) return { text: htmlToText(raw), pageRange: null };
    return { text: raw, pageRange: null };
  },
};
