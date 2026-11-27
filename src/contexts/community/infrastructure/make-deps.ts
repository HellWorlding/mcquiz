import type { CurrentUser } from "@/contexts/access";
import { makeCatalogApi, type CatalogApi } from "@/contexts/catalog";
import type { Db } from "@/shared/db/types";
import type { CommunityDeps } from "../application/ports";
import { catalogQuestions } from "./catalog-adapter";
import { postRepo } from "./supabase/post.repo";
import { reportRepo } from "./supabase/report.repo";

export type CommunityExtra = { catalog?: CatalogApi; now?: () => Date };

/** catalog 를 주지 않으면 같은 db·user 로 Catalog 공개 API 를 만든다 */
export function makeCommunityDeps(db: Db, user: CurrentUser | null, extra: CommunityExtra = {}): CommunityDeps {
  const catalog = extra.catalog ?? makeCatalogApi(db, user);
  return {
    user,
    posts: postRepo(db),
    reports: reportRepo(db),
    questions: catalogQuestions(catalog),
    now: extra.now ?? (() => new Date()),
  };
}
