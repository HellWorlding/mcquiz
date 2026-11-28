/**
 * questions add "<과목>" <파일|폴더...> [--set "<세트 이름>"] [--answers <정답파일>] [--no-ai] [--check]
 *   --check: 저장하지 않고 파싱·검증 결과(문항 수, 정답 없음, 단원 미배정, 분류 신뢰도 낮음, 경고)만 보고한다. 먼저 --check 로 보고 나서 저장.
 *   JSON(v1/v2)·텍스트·마크다운·PDF·HTML. 폴더를 주면 그 안의 문항 파일 전부(단원 번호 순).
 *   파일 하나 = 세트 하나. 같은 (과목, 단원, 질문) 문항은 덮어쓴다 (catalog C7).
 *   정답 없는 문항은 검토 필요(needs_review)로 저장되며 /admin/sets/<id> 에서 지정한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { LOW_CONFIDENCE, unitNoFromFilename } from "@/contexts/catalog";
import { extractText } from "@/contexts/catalog/server";
import { cliDeps, findSubject } from "./_deps";
import { fail, parseArgs, secs, short, summary } from "./_io";

const USAGE = `사용법:
  questions add "<과목>" <파일|폴더...> [--set "<세트 이름>"] [--answers <정답파일>] [--no-ai] [--check]`;

const QUESTION_FILE = /\.(json|txt|md|pdf|html?)$/i;

/** 파일·폴더 인자를 파일 목록으로 펼친다. 폴더 안은 단원 번호 → 이름 순 */
function expand(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) fail(`없는 경로: ${p}`);
    if (st.isDirectory()) {
      const inner = readdirSync(p)
        .filter((f) => QUESTION_FILE.test(f) && !f.startsWith("."))
        .sort((a, b) => (unitNoFromFilename(a) ?? 0) - (unitNoFromFilename(b) ?? 0) || a.localeCompare(b));
      out.push(...inner.map((f) => join(p, f)));
    } else out.push(p);
  }
  return out;
}

export async function run(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "add") fail(`questions 하위 명령이 올바르지 않습니다.\n${USAGE}`);
  const p = parseArgs(rest, ["set", "answers"]);
  const [subjectName, ...paths] = p.positional;
  if (!subjectName || paths.length === 0) fail(`questions add 에는 과목과 파일이 필요합니다.\n${USAGE}`);
  const files = expand(paths);
  if (files.length === 0) fail("문항 파일(json/txt/md/pdf/html)을 찾지 못했습니다.");

  const cli = await cliDeps({ ai: !p.flags.has("no-ai") });
  if (cli.serviceUser) console.log("경고: ADMIN_EMAIL 프로필을 찾지 못해 service 사용자로 저장합니다 (세트의 created_by 가 실패할 수 있습니다).");
  const subject = await findSubject(cli, subjectName);
  const answerText = p.options.answers ? await extractText(basename(p.options.answers), new Uint8Array(readFileSync(p.options.answers))) : null;

  const t0 = Date.now();
  const total = { files: 0, questions: 0, inserted: 0, updated: 0, failed: 0, noAnswer: 0, noUnit: 0, lowConfidence: 0, failedFiles: 0 };
  for (const path of files) {
    const name = basename(path);
    const preview = await cli.catalog.previewImport({ subjectId: subject.id, files: [{ name, bytes: new Uint8Array(readFileSync(path)) }], answerText });
    if (!preview.ok) {
      console.log(`  [실패] ${name}: ${short(preview.error, 160)}`);
      total.failedFiles++;
      continue;
    }
    const { questions, warnings, suggestedTitle, format } = preview.data;
    const noAnswer = questions.filter((q) => q.correct === null).length;
    const noUnit = questions.filter((q) => q.unitId === null).length;
    const low = questions.filter((q) => q.unitId !== null && q.unitConfidence !== null && q.unitConfidence < LOW_CONFIDENCE).length;

    if (p.flags.has("check")) {
      // 검사만: 저장하지 않는다 (중복 판정은 저장 단계에서 같은 질문문을 덮어쓰므로 여기서는 개수·경고만)
      console.log(`  [검사] ${name}: 문항 ${questions.length}개 (${format}) · 정답 없음 ${noAnswer} · 단원 미배정 ${noUnit} · 분류 신뢰도 낮음 ${low} · 경고 ${warnings.length}`);
      for (const w of warnings.slice(0, 5)) console.log(`      - ${short(w, 140)}`);
      total.files++;
      total.questions += questions.length;
      total.noAnswer += noAnswer;
      total.noUnit += noUnit;
      total.lowConfidence += low;
      continue;
    }

    const commit = await cli.catalog.commitImport({ subjectId: subject.id, title: p.options.set ?? suggestedTitle, sourceFilename: name, questions });
    if (!commit.ok) {
      console.log(`  [실패] ${name}: ${short(commit.error, 160)}`);
      total.failedFiles++;
      continue;
    }
    const r = commit.data;
    total.files++;
    total.questions += questions.length;
    total.inserted += r.inserted;
    total.updated += r.updated;
    total.failed += r.failed.length;
    total.noAnswer += noAnswer;
    total.noUnit += noUnit;
    total.lowConfidence += low;
    const notes = [noAnswer && `정답 없음 ${noAnswer}`, noUnit && `단원 미배정 ${noUnit}`, low && `분류 신뢰도 낮음 ${low}`, warnings.length && `경고 ${warnings.length}`].filter(Boolean);
    console.log(`  [ok] ${name} (${format}): 문항 ${questions.length} → 새로 ${r.inserted}, 덮어씀 ${r.updated}, 실패 ${r.failed.length}${notes.length ? ` · ${notes.join(", ")}` : ""}`);
    for (const f of r.failed) console.log(`      - #${f.index + 1} ${f.reason}`);
    for (const w of warnings.slice(0, 3)) console.log(`      - ${short(w, 120)}`);
    if (warnings.length > 3) console.log(`      - … 경고 ${warnings.length - 3}개 더`);
  }
  summary(
    `${total.files}/${files.length}개 파일 반입: 문항 ${total.questions} → 새로 ${total.inserted}, 덮어씀 ${total.updated}, 실패 ${total.failed}` +
      `${total.noAnswer ? `, 정답 없음 ${total.noAnswer}` : ""}${total.noUnit ? `, 단원 미배정 ${total.noUnit}` : ""}${total.failedFiles ? `, 파일 실패 ${total.failedFiles}` : ""} (${secs(t0)})`,
  );
  if (total.failedFiles) process.exitCode = 1;
}
