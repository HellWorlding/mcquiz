/**
 * units priority "<과목>" <1~5> "<단원번호,…>"   번호(no)가 맞는 단원에 순위 배지
 * units priority "<과목>" clear                   모든 단원의 순위 지우기
 * units priority "<과목>"                         현재 순위 보기
 */
import type { Unit } from "@/contexts/catalog";
import { cliDeps, findSubject, type Cli } from "./_deps";
import { fail, parseArgs, summary } from "./_io";

const USAGE = `사용법:
  units priority "<과목>" <1~5> "<단원번호,…>"
  units priority "<과목>" clear
  units priority "<과목>"`;

type Rank = 1 | 2 | 3 | 4 | 5;

async function setMany(cli: Cli, units: Unit[], priority: Rank | null): Promise<number> {
  let n = 0;
  for (const u of units) {
    const r = await cli.catalog.setUnitPriority(u.id, priority);
    if (!r.ok) fail(`단원 ${u.no ?? u.id}: ${r.error}`);
    n++;
  }
  return n;
}

function printCurrent(units: Unit[]) {
  const byRank = new Map<number, number[]>();
  for (const u of units) if (u.priority !== null) byRank.set(u.priority, [...(byRank.get(u.priority) ?? []), u.no ?? 0]);
  if (byRank.size === 0) console.log("  (순위가 지정된 단원 없음)");
  for (const [r, nos] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) console.log(`  ${r}순위 (${nos.length}): ${nos.sort((a, b) => a - b).join(", ")}`);
}

export async function run(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "priority") fail(`units 하위 명령이 올바르지 않습니다.\n${USAGE}`);
  const p = parseArgs(rest);
  const [subjectName, rank, list] = p.positional;
  if (!subjectName) fail(`units priority 에는 과목이 필요합니다.\n${USAGE}`);
  const cli = await cliDeps({ ai: false });
  const subject = await findSubject(cli, subjectName);
  const units = await cli.catalog.listUnits(subject.id);

  if (rank === "clear") {
    const n = await setMany(cli, units.filter((u) => u.priority !== null), null);
    summary(`단원 순위 ${n}개를 지웠습니다.`);
    return;
  }
  if (rank !== undefined) {
    const n = Number(rank);
    const nos = (list ?? "").split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x > 0);
    if (!Number.isInteger(n) || n < 1 || n > 5 || nos.length === 0) fail("순위는 1~5, 단원 번호는 쉼표로 구분해 주세요.");
    const targets = units.filter((u) => u.no !== null && nos.includes(u.no));
    const done = await setMany(cli, targets, n as Rank);
    const doneNos = [...new Set(targets.map((u) => u.no!))].sort((a, b) => a - b);
    const missing = nos.filter((x) => !doneNos.includes(x));
    for (const u of targets) u.priority = n;
    console.log(`${n}순위 ← ${doneNos.join(", ")} (${done}개)${missing.length ? `  / 없는 단원: ${missing.join(", ")}` : ""}`);
  }
  printCurrent(units);
  summary(`순위 지정 단원 ${units.filter((u) => u.priority !== null).length}개 / 전체 ${units.length}개`);
}
