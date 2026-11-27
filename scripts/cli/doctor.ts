/**
 * doctor — 읽기만 한다. .env.local 키, Supabase 연결과 스키마 노출(컨텍스트 스키마마다 REST 요청 1회),
 * ADMIN_EMAIL 프로필, OpenAI 키, 과목별 임베딩 상태를 요약한다. 하나라도 실패하면 종료 코드 1.
 */
import { env, hasOpenAI } from "@/shared/env";
import type { Db } from "@/shared/db/types";
import { embedStatus } from "@/contexts/knowledge";
import { cliDeps } from "./_deps";
import { summary } from "./_io";

let failures = 0;
const ok = (label: string, detail = "") => console.log(`  [ok] ${label}${detail ? ` — ${detail}` : ""}`);
const bad = (label: string, detail = "") => {
  failures++;
  console.log(`  [!!] ${label}${detail ? ` — ${detail}` : ""}`);
};
const check = (cond: boolean, okLabel: string, okDetail: string, badLabel: string, badDetail = "") => (cond ? ok(okLabel, okDetail) : bad(badLabel, badDetail));
/** PostgREST 오류는 message 가 비어 있을 때가 있다 (스키마 미노출 등) — code/hint/details 까지 보여 준다 */
const errText = (e: { message?: string; code?: string; hint?: string | null; details?: string | null }) =>
  [e.message, e.code && `code=${e.code}`, e.hint, e.details].filter(Boolean).join(" · ") || JSON.stringify(e);
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "(URL 형식 아님)";
  }
};

/** 스키마별로 1행 + count 요청 1회 (HEAD 는 오류 본문이 없어 원인이 비어 보인다). 스키마가 PostgREST 에 노출되지 않았으면 PGRST106 */
type ProbeError = { message: string; code?: string; hint?: string | null; details?: string | null };
function schemaProbes(db: Db): { schema: string; probe: () => PromiseLike<{ count: number | null; error: ProbeError | null }> }[] {
  const one = { count: "exact" as const };
  return [
    { schema: "access", probe: () => db.schema("access").from("profiles").select("id", one).limit(1) },
    { schema: "catalog", probe: () => db.schema("catalog").from("subjects").select("id", one).limit(1) },
    { schema: "learning", probe: () => db.schema("learning").from("attempts").select("id", one).limit(1) },
    { schema: "knowledge", probe: () => db.schema("knowledge").from("chunks").select("id", one).limit(1) },
    { schema: "community", probe: () => db.schema("community").from("posts").select("id", one).limit(1) },
  ];
}

export async function run(): Promise<void> {
  console.log("환경변수");
  check(!!env.supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL", hostOf(env.supabaseUrl), "NEXT_PUBLIC_SUPABASE_URL 없음");
  check(!!env.supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY", "", "NEXT_PUBLIC_SUPABASE_ANON_KEY 없음");
  check(!!env.serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY", "", "SUPABASE_SERVICE_ROLE_KEY 없음");
  check(!!env.adminEmail, "ADMIN_EMAIL", "", "ADMIN_EMAIL 없음", "관리자 작업의 created_by 가 비게 됩니다");
  if (hasOpenAI()) ok("OPENAI_API_KEY", `모델 ${env.openaiModel}, 임베딩 ${env.embeddingModel}`);
  else ok("OPENAI_API_KEY 없음 (선택)", "AI 파싱·분류·임베딩·챗은 꺼진 채 동작");
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    summary(`doctor: 실패 ${failures}건 — Supabase 연결은 건너뜀`);
    process.exitCode = 1;
    return;
  }

  const cli = await cliDeps({ ai: false });
  console.log("Supabase 스키마 노출 (service role, 읽기만)");
  const counts = new Map<string, number | null>();
  for (const { schema, probe } of schemaProbes(cli.db)) {
    try {
      const { count, error } = await probe();
      if (error) bad(schema, errText(error) + (error.code === "PGRST106" ? " → 마이그레이션이 아직 적용되지 않았거나, 대시보드 Settings → API → Exposed schemas 에 컨텍스트 스키마가 없습니다" : ""));
      else {
        counts.set(schema, count);
        ok(schema, `행 ${count ?? "?"}`);
      }
    } catch (e) {
      bad(schema, e instanceof Error ? e.message : String(e));
    }
  }

  console.log("관리자");
  if (cli.serviceUser) bad("ADMIN_EMAIL 프로필 없음", "가입한 뒤 subject admin <이메일> 로 지정하세요 (지금은 id=service 로 동작)");
  else ok("ADMIN_EMAIL 프로필 있음", `is_admin=${(await cli.access.profiles.byId(cli.user.id))?.isAdmin ?? "?"}`);

  console.log("과목·임베딩");
  const subjects = counts.has("catalog") ? await cli.catalog.listSubjects() : [];
  if (subjects.length === 0) console.log("  (과목 없음)");
  for (const s of subjects) {
    const st = await embedStatus(cli.knowledge, s.id);
    const state = st.total === 0 ? "자료 없음" : !st.model ? `조각 ${st.total} (임베딩 상태는 키가 있어야 확인)` : st.embedded === st.total ? `조각 ${st.total}, 임베딩 완료` : `조각 ${st.total}, 임베딩 ${st.embedded} (대기 ${st.total - st.embedded})`;
    console.log(`  - ${s.visibility === "public" ? "공개" : "제한"} id=${s.id.slice(0, 8)}… ${state}`);
  }

  summary(failures ? `doctor: 실패 ${failures}건` : `doctor: 이상 없음 (과목 ${subjects.length}개)`);
  if (failures) process.exitCode = 1;
}
