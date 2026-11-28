import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/db/database.types";
import type { CurrentUser } from "@/contexts/access";
import { makeCatalogApi } from "@/contexts/catalog/server";
import { serviceDb, tempSubject, userDb } from "../helpers";

/**
 * 반입 봉투 (D-020, PRD-mcp-reliability M2~M6). 로컬에는 WAF 가 없으므로 "SQL 본문이 봉투 경로로 그대로 저장되는가" 와
 * 원자성·권한(RLS)·needs_review 를 본다. 반입은 catalog 공개 API(importQuestions = MCP 경로)로 한다.
 */

const SQL_BLOCK = [
  "CREATE TABLE emp (id int PRIMARY KEY, name varchar(20), dept_id int REFERENCES dept(id));",
  "INSERT INTO emp (id, name, dept_id) VALUES (1, 'Kim', 10), (2, 'Lee', 20);",
  "DELETE FROM emp WHERE dept_id = 20 OR 1=1;",
  "SELECT name FROM emp UNION SELECT password FROM users; -- ' OR '1'='1",
  "<script>alert('x')</script> DROP TABLE emp;",
].join("\n");
const longSql = (tag: string) => `[${tag}] 다음 SQL 을 차례로 실행한 뒤 emp 의 행 수는?\n` + Array.from({ length: 20 }, () => SQL_BLOCK).join("\n");

describe("catalog.apply_import — 반입 봉투", () => {
  let subject: Awaited<ReturnType<typeof tempSubject>>;
  let adminApi: ReturnType<typeof makeCatalogApi>;
  let adminId = "";

  beforeAll(async () => {
    subject = await tempSubject("restricted");
    const a = await userDb("envelope-admin@test.local", undefined, { admin: true });
    adminId = a.id;
    const user: CurrentUser = { id: a.id, email: "envelope-admin@test.local", displayName: null, isAdmin: true, aiLimit: null };
    adminApi = makeCatalogApi(a.db, user, { ai: null });
  });
  afterAll(async () => {
    await subject?.cleanup();
  });

  const questions = (n: number, patch: (i: number) => Record<string, unknown> = () => ({})) =>
    Array.from({ length: n }, (_, i) => ({
      subject: subject.name,
      unit_path: ["SQL", "DML"],
      no: i + 1,
      prompt: longSql(`Q${i + 1}`),
      correct_choice: (i % 4) + 1,
      explanation: `해설 ${SQL_BLOCK}`,
      choices: [1, 2, 3, 4].map((o) => ({ ord: o, text: `${o}행 — SELECT COUNT(*) FROM emp; ${o}`, explanation: o === 1 ? "DELETE ... OR 1=1 은 모든 행을 지운다" : null })),
      ...patch(i),
    }));

  it("M1·M2·M6 SQL 문장(5KB 이상)이 든 3문항을 저장하고, 문항·선지·needs_review 가 그대로", async () => {
    const qs = questions(3, (i) => (i === 0 ? { needs_review: true } : {}));
    expect(String(qs[0].prompt).length).toBeGreaterThan(5000);
    const r = await adminApi.importQuestions({ mode: "commit", questions: qs, setTitle: "봉투 시험" });
    if (!r.ok) throw new Error(r.error);
    expect(r.data.results).toEqual([{ subject: subject.name, inserted: 3, updated: 0 }]);

    const db = serviceDb();
    const { data: rows, error } = await db.schema("catalog").from("questions").select("id, ord, prompt, correct_choice, needs_review, explanation, choice_count, set_id, choices(ord, text, explanation)").eq("subject_id", subject.id).order("ord");
    if (error) throw error;
    expect(rows).toHaveLength(3);
    expect(rows!.map((q) => q.prompt)).toEqual(qs.map((q) => q.prompt));
    expect(rows!.map((q) => q.ord)).toEqual([1, 2, 3]);
    expect(rows!.map((q) => q.correct_choice)).toEqual([1, 2, 3]);
    expect(rows!.map((q) => q.needs_review)).toEqual([true, false, false]);
    expect(rows!.every((q) => q.choice_count === 4 && q.choices.length === 4)).toBe(true);
    const c1 = [...rows![0].choices].sort((a, b) => a.ord - b.ord)[0];
    expect(c1).toEqual({ ord: 1, text: "1행 — SELECT COUNT(*) FROM emp; 1", explanation: "DELETE ... OR 1=1 은 모든 행을 지운다" });
    expect(new Set(rows!.map((q) => q.set_id)).size).toBe(1);
    const { data: set } = await db.schema("catalog").from("question_sets").select("title, created_by").eq("id", rows![0].set_id).single();
    expect(set).toEqual({ title: "봉투 시험", created_by: adminId });
  });

  it("C7 같은 질문문을 다시 넣으면 덮어쓴다 (updated=3, 새 세트 없음, 정답·선지 반영)", async () => {
    const qs = questions(3, (i) => ({ correct_choice: 4, needs_review: i === 1, choices: [1, 2, 3, 4, 5].map((o) => ({ ord: o, text: `바뀐 선지 ${o} UNION SELECT ${o}` })) }));
    const r = await adminApi.importQuestions({ mode: "commit", questions: qs, setTitle: "봉투 재반입" });
    if (!r.ok) throw new Error(r.error);
    expect(r.data.results).toEqual([{ subject: subject.name, inserted: 0, updated: 3 }]);
    const db = serviceDb();
    const { data: rows } = await db.schema("catalog").from("questions").select("correct_choice, needs_review, choice_count, choices(ord, text)").eq("subject_id", subject.id).order("ord");
    expect(rows!.map((q) => [q.correct_choice, q.needs_review, q.choice_count, q.choices.length])).toEqual([
      [4, false, 5, 5],
      [4, true, 5, 5],
      [4, false, 5, 5],
    ]);
    const { data: sets } = await db.schema("catalog").from("question_sets").select("id").eq("subject_id", subject.id);
    expect(sets).toHaveLength(1);
  });

  it("M1(로컬 대용) 반입 중 Supabase 로 나가는 요청(URL·본문) 어디에도 SQL 문장이 그대로 실리지 않는다", async () => {
    await userDb("envelope-admin@test.local", "test-password-123", { admin: true });
    const sent: string[] = [];
    const recording: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      sent.push(`${init?.method ?? "GET"} ${decodeURIComponent(url)} ${typeof init?.body === "string" ? init.body : ""}`);
      return fetch(input, init);
    };
    const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { fetch: recording } });
    const { error } = await db.auth.signInWithPassword({ email: "envelope-admin@test.local", password: "test-password-123" });
    if (error) throw error;
    const api = makeCatalogApi(db, { id: adminId, email: "envelope-admin@test.local", displayName: null, isAdmin: true, aiLimit: null }, { ai: null });
    sent.length = 0;
    const qs = questions(2, (i) => ({ unit_path: ["SQL", "DDL"], prompt: longSql(`W${i}`) }));
    for (const mode of ["check", "commit"] as const) {
      const r = await api.importQuestions({ mode, questions: qs, setTitle: "요청 검사" });
      if (!r.ok) throw new Error(r.error);
    }
    expect(sent.some((s) => s.includes("/rpc/apply_import"))).toBe(true);
    for (const s of sent) {
      expect(s).not.toContain("UNION SELECT");
      expect(s).not.toContain("DELETE FROM");
      expect(s).not.toContain("<script>");
    }
  });

  it("M4 하나라도 잘못되면 아무 행도 남지 않는다 (세트·새 문항·덮어쓰기 모두)", async () => {
    const a = await userDb("envelope-admin@test.local", undefined, { admin: true });
    const db = serviceDb();
    const before = await db.schema("catalog").from("questions").select("id, correct_choice").eq("subject_id", subject.id).order("ord");
    const { data: existing } = await db.schema("catalog").from("questions").select("id").eq("subject_id", subject.id).limit(1).single();
    const good = { prompt: "새 문항", ord: 9, correct_choice: 1, needs_review: false, choices: [1, 2, 3, 4].map((o) => ({ ord: o, text: `c${o}`, explanation: null })) };
    const payload = {
      subject_id: subject.id,
      set: { id: null, title: "실패할 세트", source_filename: null, created_by: null },
      inserts: [good],
      // 덮어쓰기는 앞쪽이 정상, 뒤쪽이 없는 문항 → 전체 롤백
      updates: [{ ...good, id: existing!.id, correct_choice: 2 }, { ...good, id: "00000000-0000-4000-8000-000000000000" }],
    };
    const res = await a.db.schema("catalog").rpc("apply_import", { p_payload: Buffer.from(JSON.stringify(payload), "utf8").toString("base64") });
    expect(res.error?.message ?? "").toContain("찾을 수 없습니다");
    const after = await db.schema("catalog").from("questions").select("id, correct_choice").eq("subject_id", subject.id).order("ord");
    expect(after.data).toEqual(before.data);
    const { data: sets } = await db.schema("catalog").from("question_sets").select("title").eq("subject_id", subject.id);
    expect(sets!.map((s) => s.title)).not.toContain("실패할 세트");
  });

  it("M5 봉투가 base64·JSON 이 아니거나 선지가 4~5개가 아니면 저장하지 않는다", async () => {
    const a = await userDb("envelope-admin@test.local", undefined, { admin: true });
    const bad1 = await a.db.schema("catalog").rpc("apply_import", { p_payload: "not base64 !!" });
    expect(bad1.error?.message ?? "").toContain("봉투");
    const three = { subject_id: subject.id, set: { id: null, title: "t" }, inserts: [{ prompt: "p", ord: 1, correct_choice: 1, choices: [1, 2, 3].map((o) => ({ ord: o, text: `c${o}` })) }], updates: [] };
    const bad2 = await a.db.schema("catalog").rpc("apply_import", { p_payload: Buffer.from(JSON.stringify(three)).toString("base64") });
    expect(bad2.error?.message ?? "").toContain("선지가 3개");
  });

  it("M3 비관리자·anon 은 함수가 거부하고 아무 행도 남기지 않는다", async () => {
    const u = await userDb("envelope-user@test.local");
    const payload = { subject_id: subject.id, set: { id: null, title: "비관리자 세트" }, inserts: [{ prompt: "p", ord: 1, correct_choice: 1, choices: [1, 2, 3, 4].map((o) => ({ ord: o, text: `c${o}` })) }], updates: [] };
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const res = await u.db.schema("catalog").rpc("apply_import", { p_payload: b64 });
    expect(res.error?.message ?? "").toContain("관리자만");
    // 비관리자가 공개 API 로 불러도 use case 가 먼저 막는다
    const userApi = makeCatalogApi(u.db, { id: u.id, email: "envelope-user@test.local", displayName: null, isAdmin: false, aiLimit: null }, { ai: null });
    expect((await userApi.importQuestions({ mode: "commit", questions: questions(1) })).ok).toBe(false);
    const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const ares = await anon.schema("catalog").rpc("apply_import", { p_payload: b64 });
    expect(ares.error).not.toBeNull();
    const { data: sets } = await serviceDb().schema("catalog").from("question_sets").select("title").eq("subject_id", subject.id);
    expect(sets!.map((s) => s.title)).not.toContain("비관리자 세트");
  });

  it("service role(CLI)은 관리자처럼 쓸 수 있다", async () => {
    const payload = { subject_id: subject.id, set: { id: null, title: "CLI 세트", source_filename: "cli.json", created_by: null }, inserts: [{ prompt: "CLI 문항", ord: 1, correct_choice: null, choices: [1, 2, 3, 4].map((o) => ({ ord: o, text: `c${o}` })) }], updates: [] };
    const res = await serviceDb().schema("catalog").rpc("apply_import", { p_payload: Buffer.from(JSON.stringify(payload)).toString("base64") });
    if (res.error) throw res.error;
    expect(res.data).toMatchObject({ inserted: 1, updated: 0 });
    const { data: q } = await serviceDb().schema("catalog").from("questions").select("needs_review").eq("prompt", "CLI 문항").single();
    // 정답 없음은 needs_review 를 보내지 않아도 true
    expect(q?.needs_review).toBe(true);
  });
});
