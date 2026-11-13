/**
 * 주제의 원본 PDF(교재 등)를 비공개 저장소에 올리고 subject_files 에 등록한다.
 *   npm run upload:file -- "<주제 이름>" <PDF 경로> [--name book] [--offset 0] [--title "제목"]
 * page_offset: 책에 인쇄된 쪽수 + offset = PDF 쪽 번호 (앞에 표지·목차가 끼어 있으면 그 장수)
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { adminDb, findSubject } from "./_db";

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => {
    const i = args.indexOf(k);
    return i >= 0 && args[i + 1] ? args[i + 1] : d;
  };
  const [subjectName, file] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!subjectName || !file) {
    console.log('사용법: npm run upload:file -- "<주제 이름>" <PDF 경로> [--name book] [--offset 0] [--title "제목"]');
    process.exit(1);
  }
  const name = opt("--name", "book");
  const page_offset = Number(opt("--offset", "0"));
  const title = opt("--title", basename(file).replace(/\.pdf$/i, ""));
  const db = adminDb();
  const subject = await findSubject(db, subjectName);
  const buf = await readFile(file);
  const storage_path = `${subject.id}/${name}.pdf`;
  const { error: upErr } = await db.storage.from("sources").upload(storage_path, buf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;
  const { error } = await db.from("subject_files").upsert({ subject_id: subject.id, name, title, storage_path, page_offset }, { onConflict: "subject_id,name" });
  if (error) throw error;
  console.log(`"${subject.name}" ← ${storage_path} (${(buf.length / 1024 / 1024).toFixed(1)} MB, offset ${page_offset})`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
