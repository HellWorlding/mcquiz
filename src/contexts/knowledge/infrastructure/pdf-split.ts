import type { PdfSplitter } from "../application/ports";

/** pdf-lib 로 필요한 쪽만 복사해 작은 PDF 를 만든다 (교재 단원별 분할) */
export const pdfSplitter: PdfSplitter = {
  async pageCount(bytes) {
    const { PDFDocument } = await import("pdf-lib");
    return (await PDFDocument.load(bytes)).getPageCount();
  },
  async slice(bytes, first, last) {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(bytes);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i));
    for (const pg of pages) doc.addPage(pg);
    return doc.save();
  },
};
