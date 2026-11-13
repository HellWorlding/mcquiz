/**
 * 주제의 원본 PDF(교재)를 비공개 저장소에 올리고 subject_files 에 등록한다.
 *
 *   npm run upload:file -- "<주제 이름>" <PDF 경로> --split [--offset 0]
 *     책 자료(sources.kind='book')의 page_range 대로 단원별 PDF 로 잘라 올린다 (pdf-lib, 필요한 쪽만 복사해 작게 만든다).
 *     "원문 보기"는 그 단원 파일만 받아서 교재 쪽수 자리로 연다. 통째 파일이 있었다면 지운다.
 *   npm run upload:file -- "<주제 이름>" <PDF 경로> [--name book] [--offset 0] [--title "제목"]
 *     통째로 올린다 (단원 파일이 없는 쪽수의 대비용).
 *
 * --offset: 교재에 인쇄된 쪽수 + offset = PDF 쪽 번호 (앞에 표지·목차가 끼어 있으면 그 장수)
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PDFDocument } from "pdf-lib";
import { adminDb, findSubject } from "./_db";

const BUCKET = "sources";

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => {
    const i = args.indexOf(k);
    return i >= 0 && args[i + 1] ? args[i + 1] : d;
  };
  const flag = (k: string) => args.includes(k);
  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--split"].includes(args[i - 1])));
  const [subjectName, file] = positional;
  if (!subjectName || !file) {
    console.log('사용법: npm run upload:file -- "<주제 이름>" <PDF 경로> --split [--offset 0]');
    process.exit(1);
  }
  const page_offset = Number(opt("--offset", "0"));
  const db = adminDb();
  const subject = await findSubject(db, subjectName);

  if (!flag("--split")) {
    const name = opt("--name", "book");
    const title = opt("--title", basename(file).replace(/\.pdf$/i, ""));
    const buf = readFileSync(file);
    const storage_path = `${subject.id}/${name}.pdf`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(storage_path, buf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;
    const { error } = await db.from("subject_files").upsert({ subject_id: subject.id, name, title, storage_path, page_offset }, { onConflict: "subject_id,name" });
    if (error) throw error;
    console.log(`"${subject.name}" ← ${storage_path} (${(buf.length / 1024 / 1024).toFixed(1)} MB, offset ${page_offset})`);
    return;
  }

  // 단원별 분할: 책 자료의 page_range("5-10") 를 그대로 쓴다
  const { data: books, error: bErr } = await db.from("sources").select("id, title, unit_id, page_range, units(no, title)").eq("subject_id", subject.id).eq("kind", "book").not("page_range", "is", null);
  if (bErr) throw bErr;
  const rows = (books ?? [])
    .map((b) => {
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(b.page_range ?? "");
      const unit = b.units as unknown as { no: number | null; title: string } | null;
      return m ? { ...b, from: Number(m[1]), to: Number(m[2]), unitNo: unit?.no ?? null, unitTitle: unit?.title ?? b.title } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.from - b.from);
  if (rows.length === 0) {
    console.error("책 자료(kind=book)에 page_range 가 없습니다. 먼저 책 텍스트를 올리세요.");
    process.exit(1);
  }
  const src = await PDFDocument.load(readFileSync(file));
  const total = src.getPageCount();
  {
    for (const r of rows) {
      const first = r.from + page_offset;
      const last = Math.min(r.to + page_offset, total);
      if (first < 1 || first > last) {
        console.error(`${r.unitTitle}: p.${r.from}-${r.to} 가 PDF 범위(1-${total}) 밖입니다. 건너뜀`);
        continue;
      }
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(src, Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i));
      for (const pg of pages) doc.addPage(pg);
      const buf = Buffer.from(await doc.save());
      const key = r.unitNo !== null ? String(r.unitNo).padStart(3, "0") : r.id;
      const storage_path = `${subject.id}/book/${key}.pdf`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(storage_path, buf, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { error } = await db.from("subject_files").upsert(
        { subject_id: subject.id, name: `book:${key}`, title: r.unitTitle, storage_path, page_offset, unit_id: r.unit_id, page_from: r.from, page_to: r.to, pages: r.to - r.from + 1 },
        { onConflict: "subject_id,name" },
      );
      if (error) throw error;
      console.log(`${key} ${r.unitTitle} p.${r.from}-${r.to} → ${storage_path} (${(buf.length / 1024).toFixed(0)} KB)`);
    }
  }
  // 통째 파일은 지운다 (단원 파일만 쓴다)
  const { data: whole } = await db.from("subject_files").select("id, storage_path").eq("subject_id", subject.id).eq("name", "book").maybeSingle();
  if (whole) {
    await db.storage.from(BUCKET).remove([whole.storage_path]);
    await db.from("subject_files").delete().eq("id", whole.id);
    console.log(`통째 파일 삭제: ${whole.storage_path}`);
  }
  console.log(`완료: ${rows.length}개 단원 파일`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
