import type { AuthInfo } from "@modelcontextprotocol/server";
import type { CurrentUser } from "@/contexts/access";
import { makeCatalogApi } from "@/contexts/catalog/server";
import { makeAccessDeps } from "@/contexts/access/server";
import { grantMember } from "@/contexts/access";
import { makeLearningApi } from "@/contexts/learning/server";
import { makeKnowledgeApi } from "@/contexts/knowledge/server";
import type { Db } from "@/shared/db/types";
import { err, ok, type Result } from "@/shared/result";
import type { ToolContext } from "../application/tools";
import { userFromAuth } from "./mcp-auth";

/** app_link 에 쓰는 앱 호스트 */
export const APP_HOST = process.env.NEXT_PUBLIC_CANONICAL_HOST || "mcquiz.site";

/** 토큰 클라이언트 + 사용자로 세 컨텍스트 공개 API 를 조립한다. MCP 는 JSON 문항만 넣으므로 AI 파서는 붙이지 않는다 */
export function toolContext(db: Db, user: CurrentUser): ToolContext {
  const catalog = makeCatalogApi(db, user, { ai: null });
  const access = makeAccessDeps(db, user); // 관리자 토큰이면 RLS 로 전체 프로필을 읽어 이메일 검색이 된다
  return {
    user,
    access: { grantMember: (subjectId, email) => grantMember(access, subjectId, email) },
    catalog,
    learning: makeLearningApi(db, user, { catalog }),
    knowledge: makeKnowledgeApi(db, user, { catalog }),
    appHost: APP_HOST,
  };
}

/** 도구 호출마다: 인증 정보 → ToolContext */
export async function toolContextFromAuth(authInfo: AuthInfo | undefined): Promise<Result<ToolContext>> {
  const r = await userFromAuth(authInfo);
  if (!r.ok) return err(r.error);
  return ok(toolContext(r.data.db, r.data.user));
}
