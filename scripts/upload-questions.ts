/**
 * 문제 파일(JSON/txt/md/pdf)을 파싱해 세트로 저장한다. 단원은 자동 분류한다.
 *   npm run upload:questions -- "<주제 이름>" <문제파일> [정답파일] [--title "세트 이름"] [--no-ai]
 * 정답이 없는 문항은 needs_review 로 저장되며 /admin/sets/<id> 에서 지정할 수 있다.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { adminDb, findSubject } from "./_db";
import { extractText } from "../src/domains/import/sources";
import { parseAny } from "../src/domains/import/parse";
import { unitNoFromFilename } from "../src/domains/import/parse-text";
import { classifyQuestion } from "../src/domains/import/classify";
import { saveQuestionSet } from "../src/domains/import/save";
import type { PreviewQuestion } from "../src/domains/import/types";

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--title"));
  const [subjectName, qFile, aFile] = positional;
  if (!subjectName || !qFile) {
    console.error('사용법: npm run upload:questions -- "<주제 이름>" <문제파일> [정답파일] [--title "세트 이름"] [--no-ai]');
    process.exit(1);
  }
  const titleIdx = args.indexOf("--title");
  const title = titleIdx >= 0 ? args[titleIdx + 1] : basename(qFile).replace(/\.[a-z0-9]+$/i, "");
  const allowAI = !args.includes("--no-ai");

  const db = adminDb();
  const subject = await findSubject(db, subjectName);
  const q = await extractText(basename(qFile), new Uint8Array(readFileSync(qFile)));
  const a = aFile ? await extractText(basename(aFile), new Uint8Array(readFileSync(aFile))) : null;
  const parsed = await parseAny(q.text, a?.text ?? null, { allowAI });
  if (parsed.questions.length === 0) {
    console.error("문항을 찾지 못했습니다.", parsed.warnings);
    process.exit(1);
  }
  const fileUnit = unitNoFromFilename(basename(qFile));
  const { data: units } = await db.from("units").select("*").eq("subject_id", subject.id);
  const preview: PreviewQuestion[] = [];
  for (let i = 0; i < parsed.questions.length; i++) {
    const pq = parsed.questions[i];
    if (pq.unitHint === null && fileUnit !== null) pq.unitHint = fileUnit;
    const u = await classifyQuestion(db, subject.id, units ?? [], pq, { useAI: allowAI });
    preview.push({ ...pq, key: `q${i}`, unitId: u.unitId, unitConfidence: u.confidence, unitCandidates: u.candidates });
    const unitTitle = (units ?? []).find((x) => x.id === u.unitId)?.title ?? "-";
    console.log(`  ${i + 1}. [${u.method} ${u.confidence ?? "-"}] ${unitTitle} | ${pq.prompt.slice(0, 40)}${pq.correct === null ? " (정답 없음)" : ""}`);
  }
  const r = await saveQuestionSet(db, {
    subjectId: subject.id,
    title,
    sourceFilename: basename(qFile),
    createdBy: null,
    questions: preview,
  });
  console.log(`저장 완료: 세트 ${r.setId}, ${r.count}문항. 경고: ${parsed.warnings.length ? parsed.warnings.join("; ") : "없음"}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
