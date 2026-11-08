/**
 * 폴더의 questions_*.json 을 전부 올린다. 같은 (주제, 단원, 질문) 문항은 덮어쓴다.
 *   npm run import:questions -- <폴더> [--subject "<주제 이름>"] [--no-ai]
 * 주제를 생략하면 .env.local 의 DEFAULT_SUBJECT 를 쓴다.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { adminDb, findSubject } from "./_db";
import { parseJsonQuestions } from "../src/domains/import/parse-json";
import { unitNoFromFilename } from "../src/domains/import/parse-text";
import { classifyQuestion } from "../src/domains/import/classify";
import { saveQuestionSet, validateQuestions } from "../src/domains/import/save";
import type { PreviewQuestion } from "../src/domains/import/types";

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--subject");
  const si = args.indexOf("--subject");
  const subjectName = si >= 0 ? args[si + 1] : process.env.DEFAULT_SUBJECT;
  const allowAI = !args.includes("--no-ai");
  if (!dir || !subjectName) {
    console.error('사용법: npm run import:questions -- <폴더> --subject "<주제 이름>"  (또는 .env.local 에 DEFAULT_SUBJECT 설정)');
    process.exit(1);
  }
  const db = adminDb();
  const subject = await findSubject(db, subjectName);
  const { data: units } = await db.from("units").select("*").eq("subject_id", subject.id);
  const files = readdirSync(dir)
    .filter((f) => /^questions_.*\.json$/i.test(f))
    .sort((a, b) => (unitNoFromFilename(a) ?? 0) - (unitNoFromFilename(b) ?? 0));
  if (files.length === 0) {
    console.error(`${dir} 에 questions_*.json 이 없습니다.`);
    process.exit(1);
  }
  console.log(`${files.length}개 파일 → 주제 "${subject.name}"`);
  let totalIns = 0, totalUpd = 0, totalFail = 0;
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const parsed = parseJsonQuestions(text);
    if (parsed.questions.length === 0) {
      console.log(`  [skip] ${f}: ${parsed.warnings.join("; ") || "문항 없음"}`);
      continue;
    }
    const fileUnit = unitNoFromFilename(f);
    const preview: PreviewQuestion[] = [];
    for (let i = 0; i < parsed.questions.length; i++) {
      const q = parsed.questions[i];
      if (q.unitHint === null && fileUnit !== null) q.unitHint = fileUnit;
      const a = await classifyQuestion(db, subject.id, units ?? [], q, { useAI: allowAI });
      preview.push({ ...q, key: `q${i}`, unitId: a.unitId, unitConfidence: a.confidence, unitCandidates: a.candidates });
    }
    const { valid, failed } = validateQuestions(preview);
    for (const x of failed) console.log(`  [실패] ${f} #${x.index + 1}: ${x.reason} — ${x.prompt.slice(0, 40)}`);
    if (valid.length === 0) {
      console.log(`  [skip] ${f}: 저장할 문항 없음`);
      totalFail += failed.length;
      continue;
    }
    const r = await saveQuestionSet(db, {
      subjectId: subject.id,
      title: basename(f).replace(/\.json$/i, ""),
      sourceFilename: f,
      createdBy: null,
      questions: valid,
    });
    totalIns += r.inserted; totalUpd += r.updated; totalFail += failed.length;
    console.log(`  [ok] ${f}: 새로 ${r.inserted}, 덮어씀 ${r.updated}, 실패 ${failed.length}`);
  }
  console.log(`합계: 새로 ${totalIns}, 덮어씀 ${totalUpd}, 실패 ${totalFail}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
