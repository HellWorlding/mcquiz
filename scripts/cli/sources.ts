/**
 * sources add "<과목>" <폴더> [--kind script|note|book|doc|other] [--parent <단원id>] [--no-embed]
 * sources embed "<과목>" [--force] [--dry]
 * sources file "<과목>" <PDF> [--split] [--offset N] [--name book] [--title "제목"]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { env } from "@/shared/env";
import { embedPending, embedStatus, estimateTokens, registerSource, SOURCE_KINDS, splitBookFile, uploadWholeFile, type SourceKind } from "@/contexts/knowledge";
import { cliDeps, findSubject } from "./_deps";
import { fail, intOption, kb, mb, parseArgs, secs, short, summary } from "./_io";

const USAGE = `사용법:
  sources add "<과목>" <폴더> [--kind script|note|book|doc|other] [--parent <단원id>] [--no-embed]
  sources embed "<과목>" [--force] [--dry]
  sources file "<과목>" <PDF> [--split] [--offset N] [--name book] [--title "제목"]`;

/** text-embedding-3-large 100만 토큰당 요금 (어림). 옛 embed-chunks 와 같은 값 */
const USD_PER_M_TOKENS = 0.13;

const isToc = (f: string) => /목차|toc/i.test(f);

async function add(argv: string[]) {
  const p = parseArgs(argv, ["kind", "parent"]);
  const [subjectName, dir] = p.positional;
  if (!subjectName || !dir) fail(`sources add 에는 과목과 폴더가 필요합니다.\n${USAGE}`);
  const kindRaw = p.options.kind ?? "script";
  const kind = SOURCE_KINDS.find((k) => k === kindRaw) as SourceKind | undefined;
  if (!kind) fail(`--kind 는 ${SOURCE_KINDS.join("|")} 중 하나여야 합니다.`);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) fail(`폴더가 아닙니다: ${dir}`);

  const cli = await cliDeps({ ai: false });
  const subject = await findSubject(cli, subjectName);
  // 목차 파일을 먼저 등록해 단원을 만든 뒤 나머지를 연결한다
  const files = readdirSync(dir)
    .filter((f) => /\.(txt|md|pdf|html?)$/i.test(f) && !f.startsWith("."))
    .sort((a, b) => Number(isToc(b)) - Number(isToc(a)) || a.localeCompare(b));
  if (files.length === 0) fail(`${dir} 에 txt/md/pdf/html 파일이 없습니다.`);
  const deps = p.flags.has("no-embed") ? { ...cli.knowledge, embeddings: null } : cli.knowledge;
  if (!p.flags.has("no-embed") && !deps.embeddings) console.log("OPENAI_API_KEY 가 없어 임베딩은 건너뜁니다 (나중에 sources embed 로 채울 수 있습니다).");

  const t0 = Date.now();
  const counts = { source: 0, toc: 0, skipped: 0 };
  for (const f of files) {
    const r = await registerSource(deps, { subjectId: subject.id, filename: f, bytes: new Uint8Array(readFileSync(join(dir, f))), kind, parentUnitId: p.options.parent ?? null, embedBudgetMs: 0 });
    const status = r.ok ? r.data.status : "skipped";
    counts[status]++;
    console.log(`  [${status}] ${f}: ${short(r.ok ? r.data.message : r.error, 160)}`);
  }
  summary(`${files.length}개 파일 → 자료 ${counts.source}, 목차 ${counts.toc}, 건너뜀 ${counts.skipped} (${secs(t0)})`);
  if (counts.skipped) process.exitCode = 1;
}

async function embed(argv: string[]) {
  const p = parseArgs(argv);
  const [subjectName] = p.positional;
  if (!subjectName) fail(`sources embed 에는 과목이 필요합니다.\n${USAGE}`);
  const force = p.flags.has("force");
  const dry = p.flags.has("dry");
  const cli = await cliDeps({ ai: false });
  const subject = await findSubject(cli, subjectName);

  const status = await embedStatus(cli.knowledge, subject.id);
  const model = status.model ?? env.embeddingModel;
  const pending = await cli.knowledge.chunks.listPending({ subjectId: subject.id }, model, force);
  console.log(`조각 ${status.total}개, 현재 모델(${model}) 임베딩 ${status.model ? status.embedded : "? (키 없음)"}개 → 할 일 ${pending.length}개`);
  if (pending.length === 0) {
    summary("할 일이 없습니다.");
    return;
  }
  const chars = pending.reduce((s, r) => s + r.content.length, 0);
  const tokens = pending.reduce((s, r) => s + estimateTokens(r.content), 0);
  console.log(`  글자 ${chars.toLocaleString()}자 ≈ ${tokens.toLocaleString()} 토큰 ≈ $${((tokens / 1_000_000) * USD_PER_M_TOKENS).toFixed(3)}`);
  if (dry) {
    summary(`--dry: 임베딩하지 않았습니다 (${pending.length}개 대기).`);
    return;
  }
  if (!cli.knowledge.embeddings) fail("OPENAI_API_KEY 가 .env.local 에 없습니다.");

  const t0 = Date.now();
  const r = await embedPending(cli.knowledge, { subjectId: subject.id }, { force, onBatch: (x) => process.stdout.write(`\r  ${x.done}/${x.total} (${secs(t0)})`) });
  process.stdout.write("\n");
  if (r.failed) fail(`임베딩 실패: ${r.failed} (${r.done}/${r.total} 까지 저장됨. 다시 실행하면 이어서 합니다)`);
  summary(`완료: ${r.done}개 임베딩 (${secs(t0)}, ≈ $${((tokens / 1_000_000) * USD_PER_M_TOKENS).toFixed(3)})`);
}

async function file(argv: string[]) {
  const p = parseArgs(argv, ["offset", "name", "title"]);
  const [subjectName, pdf] = p.positional;
  if (!subjectName || !pdf) fail(`sources file 에는 과목과 PDF 경로가 필요합니다.\n${USAGE}`);
  if (!/\.pdf$/i.test(pdf)) fail("PDF 파일만 올릴 수 있습니다.");
  const pageOffset = intOption(p, "offset", 0) ?? 0;
  const cli = await cliDeps({ ai: false });
  const subject = await findSubject(cli, subjectName);
  const bytes = new Uint8Array(readFileSync(pdf));

  if (!p.flags.has("split")) {
    const name = p.options.name ?? "book";
    const title = p.options.title ?? basename(pdf).replace(/\.pdf$/i, "");
    const r = await uploadWholeFile(cli.knowledge, { subjectId: subject.id, bytes, name, title, pageOffset });
    if (!r.ok) fail(r.error);
    summary(`통째 파일 등록: ${r.data.storagePath} (${mb(bytes.byteLength)}, offset ${pageOffset})`);
    return;
  }

  const t0 = Date.now();
  const r = await splitBookFile(cli.knowledge, {
    subjectId: subject.id,
    bytes,
    pageOffset,
    onFile: (f) => console.log(`  ${f.key} p.${f.from}-${f.to} → ${f.storagePath} (${kb(f.bytes)})`),
  });
  if (!r.ok) fail(r.error);
  for (const s of r.data.skipped) console.log(`  [건너뜀] ${s}`);
  if (r.data.removedWhole) console.log(`  통째 파일 삭제: ${r.data.removedWhole}`);
  summary(`단원 파일 ${r.data.files.length}개 등록, 건너뜀 ${r.data.skipped.length} (${secs(t0)})`);
}

export async function run(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub === "add") return add(rest);
  if (sub === "embed") return embed(rest);
  if (sub === "file") return file(rest);
  fail(`sources 하위 명령이 올바르지 않습니다.\n${USAGE}`);
}
