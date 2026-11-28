/**
 * mcp smoke [--url <MCP 주소>] [--import <subject_id>]
 *
 * 배포 뒤 운영 MCP 를 실제 사용자 토큰으로 짧게 확인한다 (D-020 ③, PRD-mcp-reliability G5). **쓰기는 하지 않는다.**
 *   1. .env.local 의 MCP_SMOKE_EMAIL / MCP_SMOKE_PASSWORD 로 Supabase 비밀번호 로그인 → 액세스 토큰
 *      (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 의 프로젝트. 토큰·비밀번호는 출력하지 않는다)
 *   2. MCP_SMOKE_URL(기본 https://mcquiz.site/api/mcp) 에 initialize → tools/list (도구 수·이름, 13개가 아니면 실패)
 *   3. tools/call list_subjects → server_version · tool_count (tools/list 수와 다르면 실패)
 *   4. (--import) import_questions mode=check 로 SQL 문장이 든 샘플 2문항 검사. 비관리자 계정이면 거부되는 것이 정상(M10)
 * 하나라도 실패하면 종료 코드 1.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "@/shared/env";
import { SERVER_VERSION, TOOL_NAMES } from "@/contexts/integration";
import { fail, parseArgs, summary } from "./_io";

const USAGE = `사용법:
  mcp smoke [--url <MCP 주소>] [--import <subject_id>]
    .env.local: MCP_SMOKE_EMAIL, MCP_SMOKE_PASSWORD (테스트 계정), MCP_SMOKE_URL (선택, 기본 https://mcquiz.site/api/mcp)`;

const DEFAULT_URL = "https://mcquiz.site/api/mcp";
const EXPECTED_TOOLS = TOOL_NAMES.length; // 13
const STEP_TIMEOUT_MS = 30_000;

type RpcResponse = { jsonrpc: "2.0"; id?: number; result?: Record<string, unknown>; error?: { code: number; message: string } };

/** Streamable HTTP 응답은 JSON 이거나 SSE(`data: {...}`) 다. 둘 다 읽는다 */
export function parseRpcBody(body: string): RpcResponse | null {
  const t = body.trim();
  try {
    if (t.startsWith("{")) return JSON.parse(t) as RpcResponse;
    const lines = t.split(/\r?\n/).filter((l) => l.startsWith("data:"));
    return lines.length ? (JSON.parse(lines[lines.length - 1].slice(5).trim()) as RpcResponse) : null;
  } catch {
    return null;
  }
}

/** SQL 문장·HTML 이 든 샘플 문항 2개 (check 만 — 저장하지 않는다) */
export function smokeQuestions(subjectName: string) {
  const sql = [
    "CREATE TABLE emp (id int PRIMARY KEY, name varchar(20), dept_id int);",
    "INSERT INTO emp VALUES (1, 'Kim', 10), (2, 'Lee', 20);",
    "DELETE FROM emp WHERE dept_id = 20 OR 1=1;",
    "SELECT name FROM emp UNION SELECT password FROM users; -- ' OR '1'='1",
  ].join("\n");
  const body = Array.from({ length: 12 }, () => sql).join("\n");
  return [1, 2].map((no) => ({
    subject: subjectName,
    unit_path: ["MCP Smoke", "SQL"],
    no,
    prompt: `[smoke ${no}] 다음 SQL 을 차례로 실행한 뒤 emp 의 행 수는?\n${body}`,
    correct_choice: 1,
    explanation: `DELETE ... OR 1=1 은 모든 행을 지운다. <script>alert(${no})</script>`,
    choices: ["0", "1", "2", "3"].map((t, i) => ({ ord: i + 1, text: `${t}행 — SELECT COUNT(*) FROM emp;`, explanation: i === 0 ? "모든 행이 지워진다" : null })),
  }));
}

const mask = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");

export async function run(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "smoke") fail(USAGE);
  const p = parseArgs(rest, ["url", "import"]);
  const url = p.options.url ?? process.env.MCP_SMOKE_URL ?? DEFAULT_URL;
  const email = process.env.MCP_SMOKE_EMAIL ?? "";
  const password = process.env.MCP_SMOKE_PASSWORD ?? "";
  if (!email || !password) fail("MCP_SMOKE_EMAIL / MCP_SMOKE_PASSWORD 가 .env.local 에 필요합니다 (테스트 계정).");
  if (!env.supabaseUrl || !env.supabaseAnonKey) fail("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다.");

  let failures = 0;
  const ok = (label: string, detail = "") => console.log(`  [ok] ${label}${detail ? ` — ${detail}` : ""}`);
  const bad = (label: string, detail = "") => {
    failures++;
    console.log(`  [!!] ${label}${detail ? ` — ${detail}` : ""}`);
  };

  console.log(`MCP 스모크: ${url} (계정 ${mask(email)}, 쓰기 없음)`);
  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await sb.auth.signInWithPassword({ email, password });
  const token = signIn.data.session?.access_token;
  if (signIn.error || !token) fail(`로그인 실패: ${signIn.error?.message ?? "세션 없음"}`);
  ok("로그인", new URL(env.supabaseUrl).host);

  let id = 0;
  let session: string | undefined;
  const call = async (method: string, params: Record<string, unknown> = {}, notify = false): Promise<RpcResponse | null> => {
    const t0 = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(session ? { "mcp-session-id": session } : {}),
      },
      body: JSON.stringify(notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++id, method, params }),
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    session = res.headers.get("mcp-session-id") ?? session;
    const text = await res.text();
    if (notify) return null;
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    const body = parseRpcBody(text);
    if (!body) throw new Error(`${method}: 응답을 읽지 못함 ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    console.log(`       (${method} ${Date.now() - t0}ms)`);
    return body;
  };
  const toolText = (r: RpcResponse | null) => {
    const content = (r?.result?.content ?? []) as { type: string; text: string }[];
    return { text: content[0]?.text ?? "", isError: r?.result?.isError === true };
  };

  try {
    const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcquiz-smoke", version: SERVER_VERSION } });
    const info = (init?.result?.serverInfo ?? {}) as { name?: string; version?: string };
    ok("initialize", `serverInfo ${info.name ?? "?"} ${info.version ?? "?"}`);
    await call("notifications/initialized", {}, true).catch(() => null);

    const list = await call("tools/list");
    const names = ((list?.result?.tools ?? []) as { name: string }[]).map((t) => t.name);
    console.log(`       도구 ${names.length}개: ${names.join(", ")}`);
    if (names.length === EXPECTED_TOOLS) ok("tools/list", `${names.length}개`);
    else bad("tools/list", `${names.length}개 (기대 ${EXPECTED_TOOLS}개)`);
    const missing = TOOL_NAMES.filter((n) => !names.includes(n));
    const extra = names.filter((n) => !(TOOL_NAMES as string[]).includes(n));
    if (missing.length || extra.length) bad("도구 이름", `없음 [${missing.join(", ")}] · 모르는 것 [${extra.join(", ")}]`);

    const subjectsRes = toolText(await call("tools/call", { name: "list_subjects", arguments: {} }));
    if (subjectsRes.isError) throw new Error(`list_subjects: ${subjectsRes.text}`);
    const out = JSON.parse(subjectsRes.text) as { server_version?: string; tool_count?: number; tool_names?: string[]; subjects?: { id: string; name: string }[] } | unknown[];
    if (Array.isArray(out)) bad("list_subjects", "서버 정보가 없는 옛 응답(배열) — 새 배포가 아직 적용되지 않았습니다");
    else {
      console.log(`       server_version=${out.server_version} tool_count=${out.tool_count} 과목 ${out.subjects?.length ?? 0}개`);
      if (out.tool_count === names.length) ok("list_subjects", `tool_count ${out.tool_count} = tools/list ${names.length}`);
      else bad("list_subjects", `tool_count ${out.tool_count} ≠ tools/list ${names.length} → 커넥터의 도구 목록이 낡았거나 배포가 섞임`);
      if (out.server_version !== SERVER_VERSION) console.log(`  [..] server_version ${out.server_version} ≠ 이 저장소 ${SERVER_VERSION} (배포가 아직이거나 저장소가 다름)`);
    }

    const importSubject = p.options.import;
    if (importSubject) {
      const subject = Array.isArray(out) ? undefined : out.subjects?.find((s) => s.id === importSubject);
      if (!subject) bad("import_questions(check)", `과목 ${importSubject} 이 list_subjects 에 없습니다 (볼 권한이 없거나 id 가 틀림)`);
      else {
        const r = toolText(await call("tools/call", { name: "import_questions", arguments: { mode: "check", questions: smokeQuestions(subject.name) } }));
        if (r.isError && r.text.includes("관리자")) ok("import_questions(check)", "비관리자 계정이라 거부됨 (M10 정상). SQL 본문이 든 요청은 앱까지 도착함");
        else if (r.isError) bad("import_questions(check)", r.text.slice(0, 300));
        else {
          const rep = JSON.parse(r.text) as { valid?: number; failed?: number; problems?: string[]; duplicates_with_existing?: number };
          console.log(`       valid=${rep.valid} failed=${rep.failed} duplicates=${rep.duplicates_with_existing} problems=${(rep.problems ?? []).length}`);
          for (const pr of (rep.problems ?? []).slice(0, 5)) console.log(`       - ${pr.slice(0, 160)}`);
          if (rep.valid === 2) ok("import_questions(check)", "SQL 본문 2문항 검사 통과 (저장하지 않음)");
          else bad("import_questions(check)", `valid=${rep.valid} (기대 2)`);
        }
      }
    }
  } catch (e) {
    bad("요청 실패", e instanceof Error ? e.message : String(e));
  } finally {
    await sb.auth.signOut({ scope: "local" }).catch(() => null);
  }

  summary(failures ? `mcp smoke: 실패 ${failures}건` : "mcp smoke: 통과");
  if (failures) process.exitCode = 1;
}
