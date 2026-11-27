import { err, type Result } from "@/shared/result";
import type { Subject, Visibility } from "../domain/types";
import { attempt, publicOnly, requireAdmin } from "./guards";
import type { CatalogDeps } from "./ports";

/** 과목 목록 (created_at 순). 활동 순 정렬은 Learning 의 subjectActivity 와 합쳐 화면에서 한다 */
export async function listSubjects(deps: CatalogDeps): Promise<Subject[]> {
  return deps.subjects.list(publicOnly(deps));
}

export async function getSubject(deps: CatalogDeps, id: string): Promise<Subject | null> {
  return deps.subjects.byId(id, publicOnly(deps));
}

export async function createSubject(deps: CatalogDeps, name: string, visibility: Visibility): Promise<Result<Subject>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  const n = name.trim();
  if (!n) return err("과목 이름을 입력하세요.");
  return attempt(() => deps.subjects.create(n, visibility === "restricted" ? "restricted" : "public"));
}

export async function setSubjectVisibility(deps: CatalogDeps, id: string, visibility: Visibility): Promise<Result<void>> {
  const g = requireAdmin(deps);
  if (!g.ok) return g;
  return attempt(() => deps.subjects.setVisibility(id, visibility));
}
