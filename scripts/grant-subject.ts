/**
 * 주제 생성 / 사용자 권한 부여·회수 / 관리자 지정 (service role 사용)
 *   npm run admin:grant -- --create-subject "<이름>" [public|restricted]
 *   npm run admin:grant -- --grant "<주제 이름>" <이메일>
 *   npm run admin:grant -- --revoke "<주제 이름>" <이메일>
 *   npm run admin:grant -- --admin <이메일>
 *   npm run admin:grant -- --ai-limit <이메일> <횟수|default>   (12시간당 AI 질문 한도)
 */
import { adminDb, findSubject } from "./_db";

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const db = adminDb();
  if (cmd === "--create-subject" && a) {
    const visibility = b === "restricted" ? "restricted" : "public";
    const { data, error } = await db.from("subjects").upsert({ name: a, visibility }, { onConflict: "name" }).select("*").single();
    if (error) throw error;
    console.log(`주제 "${data.name}" (${data.visibility}) id=${data.id}`);
    return;
  }
  if ((cmd === "--grant" || cmd === "--revoke") && a && b) {
    const subject = await findSubject(db, a);
    const { data: profile } = await db.from("profiles").select("id, email").ilike("email", b).maybeSingle();
    if (!profile) {
      console.error(`${b} 계정이 없습니다. 먼저 회원가입을 해야 합니다.`);
      process.exit(1);
    }
    if (cmd === "--grant") {
      const { error } = await db.from("subject_members").upsert({ subject_id: subject.id, user_id: profile.id });
      if (error) throw error;
      console.log(`${profile.email} → "${subject.name}" 권한 부여`);
    } else {
      const { error } = await db.from("subject_members").delete().eq("subject_id", subject.id).eq("user_id", profile.id);
      if (error) throw error;
      console.log(`${profile.email} → "${subject.name}" 권한 회수`);
    }
    return;
  }
  if (cmd === "--admin" && a) {
    const { data, error } = await db.from("profiles").update({ is_admin: true }).ilike("email", a).select("email");
    if (error) throw error;
    console.log(data?.length ? `${a} 관리자 지정` : `${a} 계정이 없습니다.`);
    return;
  }
  if (cmd === "--ai-limit" && a && b) {
    const ai_limit = b === "default" ? null : Number(b);
    if (ai_limit !== null && (!Number.isInteger(ai_limit) || ai_limit < 0)) {
      console.error("횟수는 0 이상의 정수 또는 default");
      process.exit(1);
    }
    const { data, error } = await db.from("profiles").update({ ai_limit }).ilike("email", a).select("email, ai_limit");
    if (error) throw error;
    console.log(data?.length ? `${data[0].email} AI 한도 → ${data[0].ai_limit ?? "기본값"}` : `${a} 계정이 없습니다.`);
    return;
  }
  console.log(`사용법:
  --create-subject "<이름>" [public|restricted]
  --grant "<주제>" <이메일>
  --revoke "<주제>" <이메일>
  --admin <이메일>
  --ai-limit <이메일> <횟수|default>`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
