/**
 * 단원 우선순위 지정 (service role).
 *   npm run unit:priority -- "<주제>" <순위> <단원번호,…>     예: -- "교직실무" 1 "1,9,11,26"
 *   npm run unit:priority -- "<주제>" clear                 모든 단원의 순위 지우기
 *   npm run unit:priority -- "<주제>"                       현재 순위 보기
 * 단원 번호(no)가 있는 최상위 단원을 대상으로 한다.
 */
import { adminDb, findSubject } from "./_db";

async function main() {
  const [subjectName, rank, list] = process.argv.slice(2);
  if (!subjectName) {
    console.error("사용법: npm run unit:priority -- \"<주제>\" [<순위>|clear] [단원번호,…]");
    process.exit(1);
  }
  const db = adminDb();
  const subject = await findSubject(db, subjectName);
  if (rank === "clear") {
    const { error } = await db.from("units").update({ priority: null }).eq("subject_id", subject.id);
    if (error) throw new Error(error.message);
    console.log(`"${subject.name}" 단원 순위를 모두 지웠습니다.`);
    return;
  }
  if (rank) {
    const n = Number(rank);
    const nos = (list ?? "").split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x > 0);
    if (!Number.isInteger(n) || n < 1 || n > 5 || nos.length === 0) {
      console.error("순위는 1~5, 단원 번호는 쉼표로 구분해 주세요.");
      process.exit(1);
    }
    const { data, error } = await db.from("units").update({ priority: n }).eq("subject_id", subject.id).in("no", nos).select("no");
    if (error) throw new Error(error.message);
    const done = (data ?? []).map((u) => u.no).sort((a, b) => (a ?? 0) - (b ?? 0));
    const missing = nos.filter((x) => !done.includes(x));
    console.log(`${n}순위 ← ${done.join(", ")} (${done.length}개)` + (missing.length ? `  / 없는 단원: ${missing.join(", ")}` : ""));
  }
  const { data: units } = await db.from("units").select("no, title, priority").eq("subject_id", subject.id).not("priority", "is", null).order("priority").order("no");
  const byRank = new Map<number, number[]>();
  for (const u of units ?? []) byRank.set(u.priority!, [...(byRank.get(u.priority!) ?? []), u.no ?? 0]);
  for (const [r, nos] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) console.log(`  ${r}순위 (${nos.length}): ${nos.join(", ")}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
