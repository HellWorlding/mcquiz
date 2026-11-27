/**
 * subject create "<과목>" [public|restricted]
 * subject visibility "<과목>" public|restricted
 * subject grant "<과목>" <이메일>
 * subject revoke "<과목>" <이메일>
 * subject admin <이메일> [--off]
 */
import { grantMember, revokeMember } from "@/contexts/access";
import { setAdminFlag } from "./_access-ports";
import { cliDeps, findSubject } from "./_deps";
import { fail, parseArgs, summary } from "./_io";

const USAGE = `사용법:
  subject create "<과목>" [public|restricted]
  subject visibility "<과목>" public|restricted
  subject grant "<과목>" <이메일>
  subject revoke "<과목>" <이메일>
  subject admin <이메일> [--off]`;

const toVisibility = (raw: string | undefined, fallback: "public" | "restricted" | null) => {
  if (raw === undefined) return fallback ?? fail("public 또는 restricted 를 지정하세요.");
  if (raw !== "public" && raw !== "restricted") return fail(`가시성은 public 또는 restricted 여야 합니다 (받은 값: ${raw}).`);
  return raw;
};

export async function run(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  const p = parseArgs(rest);
  const [a, b] = p.positional;

  if (sub === "create" && a) {
    const visibility = toVisibility(b, "public");
    const cli = await cliDeps({ ai: false });
    const existing = (await cli.catalog.listSubjects()).find((s) => s.name === a.trim());
    if (existing) {
      summary(`이미 있는 과목 (${existing.visibility}) id=${existing.id}${existing.visibility !== visibility ? ` — 가시성을 바꾸려면: subject visibility "${existing.name}" ${visibility}` : ""}`);
      return;
    }
    const r = await cli.catalog.createSubject(a, visibility);
    if (!r.ok) fail(r.error);
    summary(`과목 생성 (${r.data.visibility}) id=${r.data.id}`);
    return;
  }

  if (sub === "visibility" && a) {
    const visibility = toVisibility(b, null);
    const cli = await cliDeps({ ai: false });
    const subject = await findSubject(cli, a);
    if (subject.visibility === visibility) {
      summary(`이미 ${visibility} 입니다.`);
      return;
    }
    const r = await cli.catalog.setSubjectVisibility(subject.id, visibility);
    if (!r.ok) fail(r.error);
    summary(`가시성 ${subject.visibility} → ${visibility}`);
    return;
  }

  if ((sub === "grant" || sub === "revoke") && a && b) {
    const cli = await cliDeps({ ai: false });
    const subject = await findSubject(cli, a);
    if (sub === "grant") {
      const r = await grantMember(cli.access, subject.id, b);
      if (!r.ok) fail(r.error);
      summary(`멤버 부여: ${b} → 과목 id=${subject.id}`);
      return;
    }
    const found = await cli.access.profiles.findByEmail(b);
    if (!found) fail(`${b} 계정이 없습니다.`);
    const r = await revokeMember(cli.access, subject.id, found.id);
    if (!r.ok) fail(r.error);
    summary(`멤버 회수: ${b} → 과목 id=${subject.id}`);
    return;
  }

  if (sub === "admin" && a) {
    const on = !p.flags.has("off");
    const cli = await cliDeps({ ai: false });
    const email = await setAdminFlag(cli.db, a, on);
    if (!email) fail(`${a} 계정이 없습니다. 먼저 회원가입을 해야 합니다.`);
    summary(`${email} 관리자 ${on ? "지정" : "해제"}`);
    return;
  }

  fail(`subject 하위 명령이 올바르지 않습니다.\n${USAGE}`);
}
