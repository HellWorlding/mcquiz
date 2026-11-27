/**
 * CLI 공통 조립: service role 클라이언트 + "관리자 사용자 객체" 로 각 컨텍스트의 공개 API 를 만든다.
 * 컨텍스트는 `@/contexts/<ctx>`(index) 와 `@/contexts/<ctx>/server` 로만 접근한다. `src/domains` 는 쓰지 않는다.
 */
import { adminDb } from "@/shared/db/admin";
import { env } from "@/shared/env";
import type { Db } from "@/shared/db/types";
import type { AccessDeps, CurrentUser } from "@/contexts/access";
import type { CatalogApi, Subject } from "@/contexts/catalog";
import { makeCatalogApi } from "@/contexts/catalog/server";
import type { LearningApi } from "@/contexts/learning";
import { makeLearningApi } from "@/contexts/learning/server";
import { knowledgeApi, type KnowledgeApi, type KnowledgeDeps } from "@/contexts/knowledge";
import { makeKnowledgeDeps } from "@/contexts/knowledge/server";
import { cliMembershipRepo, cliProfileRepo } from "./_access-ports";
import { fail } from "./_io";

export type Cli = {
  db: Db;
  /** 관리자 사용자. ADMIN_EMAIL 의 프로필이 있으면 그 사람(isAdmin 강제 true), 없으면 id "service" */
  user: CurrentUser;
  /** user.id 가 "service" 인가 (created_by 같은 FK 가 있는 쓰기는 실패할 수 있다) */
  serviceUser: boolean;
  access: AccessDeps;
  catalog: CatalogApi;
  knowledge: KnowledgeDeps;
  knowledgeApi: KnowledgeApi;
  /** 다른 사용자(학습자) 시점의 Learning API (예: learning export) */
  learningAs(user: CurrentUser): LearningApi;
  userByEmail(email: string): Promise<CurrentUser | null>;
};

export type CliOptions = {
  /** false 면 OpenAI 파서·단원 분류를 끈다 (--no-ai). 기본은 키가 있을 때만 켠다 */
  ai?: boolean;
};

function openDb(): Db {
  if (!env.supabaseUrl || !env.serviceRoleKey) fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 필요합니다.");
  try {
    return adminDb();
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

export async function cliDeps(opts: CliOptions = {}): Promise<Cli> {
  const db = openDb();
  const profiles = cliProfileRepo(db);
  const userByEmail = async (email: string) => {
    const found = await profiles.findByEmail(email);
    return found ? profiles.byId(found.id) : null;
  };

  let user: CurrentUser | null = env.adminEmail ? await userByEmail(env.adminEmail) : null;
  const serviceUser = !user;
  if (user) user = { ...user, isAdmin: true };
  else user = { id: "service", email: env.adminEmail || "service@local", displayName: "CLI", isAdmin: true, aiLimit: null };

  const catalog = makeCatalogApi(db, user, opts.ai === false ? { ai: null } : {});
  const knowledge = makeKnowledgeDeps(db, user, { catalog });
  return {
    db,
    user,
    serviceUser,
    access: { user, profiles, members: cliMembershipRepo(db) },
    catalog,
    knowledge,
    knowledgeApi: knowledgeApi(knowledge),
    learningAs: (u) => makeLearningApi(db, u, { catalog: makeCatalogApi(db, u, { ai: null }) }),
    userByEmail,
  };
}

/** 과목 이름(정확히 일치) → 과목. 없으면 안내 후 종료 코드 1 */
export async function findSubject(cli: Cli, name: string): Promise<Subject> {
  const n = name.trim();
  const found = (await cli.catalog.listSubjects()).find((s) => s.name === n);
  if (!found) return fail(`과목 "${n}" 이 없습니다. 먼저 만드세요: npm run cli -- subject create "${n}" [public|restricted]`);
  return found;
}
