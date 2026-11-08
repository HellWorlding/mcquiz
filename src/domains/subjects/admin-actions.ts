"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/domains/auth/supabase/server";
import { createAdminClient } from "@/domains/auth/supabase/admin";
import { requireAdmin } from "@/domains/auth/session";
import type { ActionResult } from "@/domains/shared/types";

export async function createSubjectAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "public") === "restricted" ? "restricted" : "public";
  if (!name) return { ok: false, error: "주제 이름을 입력하세요." };
  const db = await createClient();
  const { error } = await db.from("subjects").insert({ name, visibility });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

export async function setSubjectVisibilityAction(subjectId: string, visibility: "public" | "restricted") {
  await requireAdmin();
  const db = await createClient();
  const { error } = await db.from("subjects").update({ visibility }).eq("id", subjectId);
  revalidatePath("/admin");
  return error ? { ok: false as const, error: error.message } : { ok: true as const, data: undefined };
}

/** 이메일로 사용자를 찾아 주제 권한을 준다. 아직 가입하지 않은 이메일이면 안내한다. */
export async function grantMemberAction(subjectId: string, email: string): Promise<ActionResult> {
  await requireAdmin();
  const target = email.trim().toLowerCase();
  if (!target) return { ok: false, error: "이메일을 입력하세요." };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").ilike("email", target).maybeSingle();
  if (!profile) return { ok: false, error: `${target} 계정이 아직 없습니다. 먼저 회원가입을 해 달라고 하세요.` };
  const db = await createClient();
  const { error } = await db
    .from("subject_members")
    .upsert({ subject_id: subjectId, user_id: profile.id }, { onConflict: "subject_id,user_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

export async function revokeMemberAction(subjectId: string, userId: string): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const { error } = await db.from("subject_members").delete().eq("subject_id", subjectId).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

// ---------------- 단원 트리 ----------------

export async function createUnitAction(input: {
  subjectId: string;
  parentId: string | null;
  title: string;
  no: number | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "단원 이름을 입력하세요." };
  const db = await createClient();
  let sq = db.from("units").select("sort").eq("subject_id", input.subjectId);
  sq = input.parentId ? sq.eq("parent_id", input.parentId) : sq.is("parent_id", null);
  const { data: siblings } = await sq.order("sort", { ascending: false }).limit(1);
  const sort = input.no ?? ((siblings?.[0]?.sort ?? 0) + 1);
  const { error } = await db.from("units").insert({
    subject_id: input.subjectId,
    parent_id: input.parentId,
    title,
    no: input.no,
    sort,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/units");
  return { ok: true, data: undefined };
}

/** "파트1~파트30 한 번에 만들기" */
export async function bulkCreateUnitsAction(input: {
  subjectId: string;
  parentId: string | null;
  prefix: string;
  from: number;
  to: number;
  suffix?: string;
}): Promise<ActionResult<number>> {
  await requireAdmin();
  const { from, to } = input;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > 500) {
    return { ok: false, error: "번호 범위가 올바르지 않습니다 (최대 500개)." };
  }
  const rows = [];
  for (let n = from; n <= to; n++) {
    rows.push({
      subject_id: input.subjectId,
      parent_id: input.parentId,
      title: `${input.prefix}${n}${input.suffix ?? ""}`.trim(),
      no: n,
      sort: n,
    });
  }
  const db = await createClient();
  const { error } = await db.from("units").upsert(rows, { ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/units");
  return { ok: true, data: rows.length };
}

export async function renameUnitAction(unitId: string, title: string): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const { error } = await db.from("units").update({ title: title.trim() }).eq("id", unitId);
  revalidatePath("/admin/units");
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}

export async function moveUnitAction(unitId: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const { data: unit } = await db.from("units").select("*").eq("id", unitId).single();
  if (!unit) return { ok: false, error: "단원을 찾을 수 없습니다." };
  let q = db.from("units").select("*").eq("subject_id", unit.subject_id);
  q = unit.parent_id ? q.eq("parent_id", unit.parent_id) : q.is("parent_id", null);
  const { data: siblings } = await q.order("sort").order("no", { nullsFirst: false });
  const list = siblings ?? [];
  const idx = list.findIndex((u) => u.id === unitId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return { ok: true, data: undefined };
  // 정렬값을 인덱스로 다시 매긴 뒤 두 개를 교환한다
  const updates = list.map((u, i) => ({ id: u.id, sort: i + 1 }));
  [updates[idx].sort, updates[swapIdx].sort] = [updates[swapIdx].sort, updates[idx].sort];
  for (const u of updates) {
    await db.from("units").update({ sort: u.sort }).eq("id", u.id);
  }
  revalidatePath("/admin/units");
  return { ok: true, data: undefined };
}

export async function deleteUnitAction(unitId: string): Promise<ActionResult> {
  await requireAdmin();
  const db = await createClient();
  const { error } = await db.from("units").delete().eq("id", unitId);
  revalidatePath("/admin/units");
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}
