import type { CurrentUser } from "@/contexts/access";
import type { Db } from "@/shared/db/types";
import { communityApi, type CommunityApi } from "../application/api";
import { makeCommunityDeps, type CommunityExtra } from "./make-deps";

/** 다른 컨텍스트·scripts·MCP 가 쓰는 조립 함수 */
export function makeCommunityApi(db: Db, user: CurrentUser | null, extra: CommunityExtra = {}): CommunityApi {
  return communityApi(makeCommunityDeps(db, user, extra));
}
