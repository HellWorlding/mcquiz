/**
 * 폴더 안의 txt/md/pdf 를 sources 로 올린다. 목차 파일이 있으면 먼저 단원을 만든다.
 *   npm run upload:sources -- "<주제 이름>" <폴더> [--kind script|note|book|other] [--parent <단원id>]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { adminDb, findSubject } from "./_db";
import { importSourceFile } from "../src/domains/import/sources";

async function main() {
  const args = process.argv.slice(2);
  const [subjectName, dir] = args;
  if (!subjectName || !dir) {
    console.error('사용법: npm run upload:sources -- "<주제 이름>" <폴더> [--kind script] [--parent <단원id>]');
    process.exit(1);
  }
  const kindIdx = args.indexOf("--kind");
  const kindRaw = kindIdx >= 0 ? args[kindIdx + 1] : "script";
  const kind = (["script", "note", "book", "other"] as const).find((k) => k === kindRaw) ?? "script";
  const parentIdx = args.indexOf("--parent");
  const parentUnitId = parentIdx >= 0 ? args[parentIdx + 1] : null;

  const db = adminDb();
  const subject = await findSubject(db, subjectName);
  const files = readdirSync(dir).filter((f) => /\.(txt|md|pdf)$/i.test(f) && !f.startsWith("."));
  // 목차 먼저
  files.sort((a, b) => (/목차|toc/i.test(b) ? 1 : 0) - (/목차|toc/i.test(a) ? 1 : 0));
  console.log(`${files.length}개 파일 → 주제 "${subject.name}"`);
  for (const f of files) {
    const { data: units } = await db.from("units").select("*").eq("subject_id", subject.id);
    const r = await importSourceFile(db, {
      subjectId: subject.id,
      filename: f,
      bytes: new Uint8Array(readFileSync(join(dir, f))),
      kind,
      units: units ?? [],
      parentUnitId,
    });
    console.log(`  [${r.status}] ${f}: ${r.message}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
