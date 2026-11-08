import "server-only";
import { createClient } from "@/domains/auth/supabase/server";
import { createAdminClient } from "@/domains/auth/supabase/admin";
import { getCurrentUser } from "@/domains/auth/session";
import { env } from "@/domains/shared/env";
import { buildTree } from "@/domains/shared/tree";
import type { Collection, Subject, Unit } from "@/domains/shared/types";

/**
 * 읽기용 클라이언트. 로그인 사용자는 RLS 가 적용된 세션 클라이언트,
 * 비로그인 방문자는 PUBLIC_GUEST_ACCESS 가 켜진 경우에만 service role 로 "공개 주제" 범위만 읽는다.
 */
export async function getReadClient() {
  const user = await getCurrentUser();
  if (user) return { db: await createClient(), user, guest: false as const };
  if (env.publicGuestAccess && env.serviceRoleKey) {
    return { db: createAdminClient(), user: null, guest: true as const };
  }
  return { db: await createClient(), user: null, guest: true as const };
}

export async function listSubjects(): Promise<Subject[]> {
  const { db, guest } = await getReadClient();
  let q = db.from("subjects").select("*").order("created_at");
  if (guest) q = q.eq("visibility", "public");
  const { data } = await q;
  return data ?? [];
}

export async function getSubject(id: string): Promise<Subject | null> {
  const { db, guest } = await getReadClient();
  let q = db.from("subjects").select("*").eq("id", id);
  if (guest) q = q.eq("visibility", "public");
  const { data } = await q.maybeSingle();
  return data ?? null;
}

export async function listUnits(subjectId: string): Promise<Unit[]> {
  const { db } = await getReadClient();
  const { data } = await db
    .from("units")
    .select("*")
    .eq("subject_id", subjectId)
    .order("sort")
    .order("no", { nullsFirst: false });
  return data ?? [];
}

export async function getUnitTree(subjectId: string) {
  return buildTree(await listUnits(subjectId));
}

export async function listCollections(subjectId: string): Promise<Collection[]> {
  const { db, guest } = await getReadClient();
  if (guest) return [];
  const { data } = await db.from("collections").select("*").eq("subject_id", subjectId).order("sort");
  return data ?? [];
}

/** 선택한 단원들의 하위 단원 id 를 모두 포함해 돌려준다 */
export async function expandUnitIds(unitIds: string[]): Promise<string[]> {
  if (unitIds.length === 0) return [];
  const { db } = await getReadClient();
  const { data } = await db.rpc("unit_subtree", { root_ids: unitIds });
  return (data ?? []) as string[];
}
