/**
 * e2e 시드: 공개 과목(단원 1·세트 1·문항 8·자료 1+조각 3), 제한 과목(멤버 없음), 사용자 2명.
 * 이름은 모두 `__e2e_` 로 시작한다. globalSetup 이 만들고 globalTeardown 이 지운다.
 * tests/int/helpers.ts 의 serviceDb·userDb·tempSubject 를 e2e 용으로 옮긴 것.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/shared/db/database.types";
import { ADMIN_EMAIL, assertLocal, E2E_ANON_KEY, E2E_SERVICE_KEY, E2E_SUPABASE_URL, PASSWORD, PREFIX, USER_EMAIL } from "./env";

export type Seed = {
  publicSubject: { id: string; name: string };
  restrictedSubject: { id: string; name: string };
  unitId: string;
  setId: string;
  /** ord 순서 (1..8) */
  questions: { id: string; ord: number; prompt: string }[];
  sourceId: string;
  users: { admin: { id: string; email: string }; user: { id: string; email: string } };
};

export const QUESTION_COUNT = 8;
/** 근거 찾기(키워드) 가 맞히는 낱말. 문항 본문과 자료 조각에 모두 들어 있다 */
export const EVIDENCE_WORD = "자기효능감";

export const promptOf = (i: number) => `E2E 문항 ${i}: ${EVIDENCE_WORD} 이론의 핵심 ${i}번`;
export const correctText = (i: number) => `정답선지 ${i}`;
export const wrongText = (i: number) => `오답선지 ${i}A`;

export function serviceDb() {
  assertLocal();
  return createClient<Database>(E2E_SUPABASE_URL, E2E_SERVICE_KEY, { auth: { persistSession: false } });
}

/** 사용자(이메일+비밀번호) 만들기 또는 비밀번호 재설정 + 프로필 */
async function ensureUser(email: string, admin: boolean): Promise<{ id: string; email: string }> {
  const db = serviceDb();
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users.find((u) => u.email === email) ?? null;
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await db.auth.admin.updateUserById(user.id, { password: PASSWORD });
    if (error) throw error;
  }
  const { error } = await db.schema("access").from("profiles").upsert({ id: user.id, email, is_admin: admin }, { onConflict: "id" });
  if (error) throw error;
  return { id: user.id, email };
}

/** 사용자 세션 토큰 (MCP 테스트용) */
export async function accessToken(email: string): Promise<string> {
  const client = createClient<Database>(E2E_SUPABASE_URL, E2E_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error("세션 없음");
  return data.session.access_token;
}

function must<T>(r: { data: T; error: unknown }): NonNullable<T> {
  if (r.error) throw r.error;
  if (r.data === null || r.data === undefined) throw new Error("빈 결과");
  return r.data as NonNullable<T>;
}

/** 앞선 실행이 남긴 e2e 데이터(과목·사용자) 지우기 */
export async function cleanup(): Promise<void> {
  const db = serviceDb();
  const { data: subjects } = await db.schema("catalog").from("subjects").select("id").like("name", `${PREFIX}%`);
  for (const s of subjects ?? []) await db.schema("catalog").from("subjects").delete().eq("id", s.id);
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of list?.users ?? []) if (u.email === ADMIN_EMAIL || u.email === USER_EMAIL) await db.auth.admin.deleteUser(u.id);
}

export async function createSeed(): Promise<Seed> {
  const db = serviceDb();
  const stamp = `${Date.now().toString(36)}`;
  const cat = db.schema("catalog");

  const pub = must(await cat.from("subjects").insert({ name: `${PREFIX}공개과목_${stamp}`, visibility: "public" }).select("id,name").single());
  const res = must(await cat.from("subjects").insert({ name: `${PREFIX}제한과목_${stamp}`, visibility: "restricted" }).select("id,name").single());
  const unit = must(await cat.from("units").insert({ subject_id: pub.id, no: 1, title: "e2e 단원", sort: 1 }).select("id").single());
  const set = must(await cat.from("question_sets").insert({ subject_id: pub.id, title: `${PREFIX}세트` }).select("id").single());

  const questions: Seed["questions"] = [];
  for (let i = 1; i <= QUESTION_COUNT; i++) {
    const q = must(
      await cat
        .from("questions")
        .insert({ subject_id: pub.id, set_id: set.id, unit_id: unit.id, ord: i, prompt: promptOf(i), correct_choice: 1, choice_count: 4, explanation: `문항 ${i} 해설` })
        .select("id")
        .single(),
    );
    const { error } = await cat.from("choices").insert([
      { question_id: q.id, ord: 1, text: correctText(i), explanation: `정답 해설 ${i}` },
      { question_id: q.id, ord: 2, text: wrongText(i), explanation: `오답 해설 ${i}A` },
      { question_id: q.id, ord: 3, text: `오답선지 ${i}B`, explanation: `오답 해설 ${i}B` },
      { question_id: q.id, ord: 4, text: `오답선지 ${i}C`, explanation: `오답 해설 ${i}C` },
    ]);
    if (error) throw error;
    questions.push({ id: q.id, ord: i, prompt: promptOf(i) });
  }

  const kn = db.schema("knowledge");
  const chunks = [
    `${EVIDENCE_WORD} 은 과제를 해낼 수 있다는 자기 믿음이다. 첫째 조각.`,
    `${EVIDENCE_WORD} 이론은 반두라가 제시했다. 둘째 조각.`,
    `학습 동기와 ${EVIDENCE_WORD} 의 관계를 다룬다. 셋째 조각.`,
  ];
  const source = must(await kn.from("sources").insert({ subject_id: pub.id, unit_id: unit.id, title: `${PREFIX}자료`, kind: "script", content: chunks.join("\n\n") }).select("id").single());
  const { error: chErr } = await kn.from("chunks").insert(chunks.map((content, i) => ({ source_id: source.id, subject_id: pub.id, unit_id: unit.id, ord: i + 1, content, heading: `조각 ${i + 1}` })));
  if (chErr) throw chErr;

  const admin = await ensureUser(ADMIN_EMAIL, true);
  const user = await ensureUser(USER_EMAIL, false);

  return { publicSubject: pub, restrictedSubject: res, unitId: unit.id, setId: set.id, questions, sourceId: source.id, users: { admin, user } };
}

/** 워커에서 시드 읽기 (globalSetup 이 process.env.E2E_SEED 에 넣는다) */
export function seed(): Seed {
  const raw = process.env.E2E_SEED;
  if (!raw) throw new Error("E2E_SEED 가 없습니다 (globalSetup 이 돌지 않음)");
  return JSON.parse(raw) as Seed;
}
