/**
 * mcquiz 단일 CLI (하위 명령). `npm run cli -- <그룹> <명령> …` / `npx tsx scripts/cli.ts help`
 * 명령 모듈은 scripts/cli/<그룹>.ts. 컨텍스트는 `@/contexts/<ctx>`(index)·`/server` 로만 접근한다.
 */
import "./cli/_env"; // 반드시 첫 import: @/shared/env 가 process.env 를 읽기 전에 .env.local 을 올린다

type Command = { run: (argv: string[]) => Promise<void> };

const GROUPS: Record<string, () => Promise<Command>> = {
  subject: () => import("./cli/subject"),
  sources: () => import("./cli/sources"),
  questions: () => import("./cli/questions"),
  units: () => import("./cli/units"),
  learning: () => import("./cli/learning"),
  doctor: () => import("./cli/doctor"),
  help: () => import("./cli/help"),
};

async function main() {
  const [group = "help", ...rest] = process.argv.slice(2);
  const load = GROUPS[group] ?? (["-h", "--help"].includes(group) ? GROUPS.help : null);
  if (!load) {
    console.error(`오류: 모르는 명령 "${group}". 아래 목록을 보세요.\n`);
    await (await GROUPS.help()).run([]);
    process.exitCode = 1;
    return;
  }
  await (await load()).run(rest);
}

main().catch((e: unknown) => {
  console.error(`오류: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
