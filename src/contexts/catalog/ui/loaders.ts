import "server-only";
import { cache } from "react";
import { sessionDb } from "@/shared/db/server";
import { env } from "@/shared/env";
import { getCurrentUser } from "@/contexts/access";
import type { Collection, Question, QuestionScope, QuestionSet, Subject, Unit } from "../domain/types";
import type { TreeNode } from "../domain/tree";
import { makeApi } from "../application/api";
import { makeCatalogDeps } from "../infrastructure/make-deps";

/**
 * 페이지(서버 컴포넌트)용 로더. 요청당 한 번 deps 를 만든다.
 * 로그인 사용자는 RLS 세션 클라이언트, 비로그인 방문자는 PUBLIC_GUEST_ACCESS 가 켜진 경우에만 service role 로 "공개 과목" 범위만 읽는다.
 */
const sessionCatalog = cache(async () => {
  const user = await getCurrentUser();
  // 비로그인도 세션(anon) 클라이언트: 공개 과목만 보이는 것은 DB 의 anon 정책이 결정한다 (service role 게스트 경로 제거, 검토 B2)
  const db = await sessionDb();
  const deps = makeCatalogDeps(db, user, { ai: null });
  return { deps, api: makeApi(deps), user, guest: !user };
});

export const catalogApi = async () => (await sessionCatalog()).api;

export async function listSubjects(): Promise<Subject[]> {
  return (await catalogApi()).listSubjects();
}
export async function getSubject(id: string): Promise<Subject | null> {
  return (await catalogApi()).getSubject(id);
}
export async function listUnits(subjectId: string): Promise<Unit[]> {
  return (await catalogApi()).listUnits(subjectId);
}
export async function getUnitTree(subjectId: string): Promise<TreeNode<Unit>[]> {
  return (await catalogApi()).unitTree(subjectId);
}
export async function expandUnitIds(unitIds: string[]): Promise<string[]> {
  return (await catalogApi()).expandUnitIds(unitIds);
}
export async function listCollections(subjectId: string): Promise<Collection[]> {
  return (await catalogApi()).listCollections(subjectId);
}
export async function getCollection(id: string): Promise<Collection | null> {
  return (await catalogApi()).getCollection(id);
}
export async function listSets(subjectId: string): Promise<QuestionSet[]> {
  return (await catalogApi()).listSets(subjectId);
}
/** 관리자 화면: 모든 과목의 세트 (문항 수 포함) */
export async function listAllSets(): Promise<QuestionSet[]> {
  const { deps } = await sessionCatalog();
  return deps.sets.listAll();
}
export async function getSet(id: string): Promise<QuestionSet | null> {
  return (await catalogApi()).getSet(id);
}
/** 단원별 문항 수 (하위 단원 미포함, 화면에서 합산). 단원 없는 문항은 "__none__" */
export async function countQuestionsByUnit(subjectId: string): Promise<Record<string, number>> {
  return Object.fromEntries(await (await catalogApi()).questionCountsByUnit(subjectId));
}
export async function countQuestionsByCollection(subjectId: string): Promise<Record<string, number>> {
  return Object.fromEntries(await (await catalogApi()).questionCountsByCollection(subjectId));
}
export async function listQuestionIds(scope: QuestionScope): Promise<string[]> {
  return (await catalogApi()).questionIds(scope);
}
export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  return (await catalogApi()).questionsByIds(ids);
}
export async function listSetQuestions(setId: string): Promise<Question[]> {
  const api = await catalogApi();
  return api.questionsByIds(await api.questionIds({ kind: "set", setId }));
}
/** 묶음에 직접 든 문항 (하위 묶음 제외, 추가 순) */
export async function listCollectionQuestions(collectionId: string): Promise<Question[]> {
  const { deps, api } = await sessionCatalog();
  return api.questionsByIds([...new Set(await deps.collections.itemIds([collectionId]))]);
}
