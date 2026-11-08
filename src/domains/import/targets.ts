import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domains/shared/database.types";
import type { Unit } from "@/domains/shared/types";

type Db = SupabaseClient<Database>;
type UnitInsert = Database["public"]["Tables"]["units"]["Insert"];

async function insertUnit(db: Db, row: UnitInsert): Promise<{ data: Unit | null; error: { message: string } | null }> {
  const { data, error } = await db.from("units").insert(row).select("*").single();
  return { data: data ?? null, error: error ? { message: error.message } : null };
}

/** 주제 이름으로 주제를 찾는다 (관리자/서비스 롤에서만 자동 생성 가능) */
export async function resolveSubjectByName(
  db: Db,
  name: string,
  opts: { createIfMissing?: boolean; visibility?: "public" | "restricted" } = {},
): Promise<{ id: string; name: string } | null> {
  const { data } = await db.from("subjects").select("id, name").eq("name", name.trim()).maybeSingle();
  if (data) return data;
  if (!opts.createIfMissing) return null;
  const { data: created, error } = await db
    .from("subjects")
    .insert({ name: name.trim(), visibility: opts.visibility ?? "public" })
    .select("id, name")
    .single();
  if (error) throw new Error(`주제 "${name}" 생성 실패: ${error.message}`);
  return created;
}

/** "파트3", "Part 3", "Day12", "3강" → 3 */
export function unitNoFromTitle(title: string): number | null {
  const m = /(?:파트|part|day|unit|강|회|장)\s*[-_ ]?(\d{1,3})|(\d{1,3})\s*(?:강|회|장|과)/i.exec(title);
  if (m) return +(m[1] ?? m[2]);
  return null;
}

/**
 * 단원 경로(["콜로케이션", "파트3"])를 따라 내려가며 없는 단원은 만든다. 마지막 단원 id 를 돌려준다.
 * units 는 호출자가 미리 읽어 둔 목록이며, 새로 만든 단원은 여기에도 추가된다.
 */
export async function ensureUnitPath(db: Db, subjectId: string, path: string[], units: Unit[]): Promise<string | null> {
  let parentId: string | null = null;
  for (const rawTitle of path) {
    const title = rawTitle.trim();
    if (!title) continue;
    const existing = units.find((u) => u.subject_id === subjectId && u.parent_id === parentId && u.title === title);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const no = unitNoFromTitle(title);
    const siblings = units.filter((u) => u.subject_id === subjectId && u.parent_id === parentId);
    const sort = no ?? siblings.reduce((m, u) => Math.max(m, u.sort), 0) + 1;
    const { data, error } = await insertUnit(db, { subject_id: subjectId, parent_id: parentId, title, no, sort });
    if (error || !data) {
      // 같은 번호가 이미 있으면(unique) 번호 없이 다시 시도
      if (no !== null) {
        const { data: retry, error: e2 } = await insertUnit(db, { subject_id: subjectId, parent_id: parentId, title, no: null, sort });
        if (e2 || !retry) throw new Error(`단원 "${title}" 생성 실패: ${e2?.message ?? ""}`);
        units.push(retry);
        parentId = retry.id;
        continue;
      }
      throw new Error(`단원 "${title}" 생성 실패: ${error?.message ?? ""}`);
    }
    units.push(data);
    parentId = data.id;
  }
  return parentId;
}

/**
 * 파일명으로 주제·단원 경로를 추정한다.
 *  toeic_collocation_part3.json → { subject: "토익", unitPath: ["콜로케이션", "파트3"] }
 */
const TOEIC_GROUPS: Record<string, string> = {
  collocation: "콜로케이션",
  collocations: "콜로케이션",
  part5: "파트5 단어",
  vocab: "단어",
  hackers: "해커스 단어",
  grammar: "문법",
  listening: "듣기",
  reading: "독해",
};

export function targetFromFilename(filename: string): { subject: string; unitPath: string[] | null } | null {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  const m = /^toeic(?:[_-]([a-z0-9]+))?(?:[_-](?:part|day|unit)[_-]?(\d{1,3}))?/i.exec(base);
  if (!m) return null;
  const group = m[1] ? (TOEIC_GROUPS[m[1].toLowerCase()] ?? m[1]) : null;
  const n = m[2] ? +m[2] : null;
  const path: string[] = [];
  if (group) path.push(group);
  if (n !== null) path.push(`파트${n}`);
  return { subject: "토익", unitPath: path.length ? path : null };
}
