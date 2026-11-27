/**
 * learning export <이메일> "<과목>" [--top N] [--out <경로>]
 *   그 학습자의 학습 요약 Markdown(learning.learningSummary — MCP get_learning_summary 와 같은 내용)을
 *   content/exports/<과목>_<날짜>.md 로 저장한다. 파일에 이메일은 들어가지 않는다. content/ 는 git 제외.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cliDeps, findSubject } from "./_deps";
import { fail, intOption, parseArgs, summary } from "./_io";

const USAGE = `사용법:
  learning export <이메일> "<과목>" [--top N] [--out <경로>]`;

const slug = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_");

export async function run(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "export") fail(`learning 하위 명령이 올바르지 않습니다.\n${USAGE}`);
  const p = parseArgs(rest, ["top", "out"]);
  const [email, subjectName] = p.positional;
  if (!email || !subjectName) fail(`learning export 에는 이메일과 과목이 필요합니다.\n${USAGE}`);
  const top = intOption(p, "top", null);
  if (top !== null && top < 1) fail("--top 은 1 이상이어야 합니다.");

  const cli = await cliDeps({ ai: false });
  const learner = await cli.userByEmail(email);
  if (!learner) fail(`계정 ${email} 을 찾지 못했습니다.`);
  const subject = await findSubject(cli, subjectName);

  const r = await cli.learningAs(learner).learningSummary(subject.id, null, top ?? undefined);
  if (!r.ok) fail(r.error);

  const path = p.options.out ?? join("content", "exports", `${slug(subject.name)}_${new Date().toISOString().slice(0, 10)}.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, r.data, "utf8");
  summary(`${path} (${r.data.length.toLocaleString()}자${top ? `, 약한 문항 최대 ${top}개` : ""})`);
}
