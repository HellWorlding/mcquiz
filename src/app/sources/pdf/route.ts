import { redirect } from "next/navigation";
import { getCurrentUser } from "@/domains/auth/session";
import { createClient } from "@/domains/auth/supabase/server";

/**
 * 교재 PDF 를 교재 쪽수 자리로 연다: /sources/pdf?subject=<id>&page=<교재 쪽수>[&unit=&text=]
 * 단원별로 잘라 올린 파일(page_from~page_to) 중 그 쪽이 든 것만 내려 주고, 파일 안의 쪽(#page=N)으로 간다.
 * 권한은 저장소 RLS(주제 권한)가 결정한다. 파일이 없으면 텍스트 원문(/sources/find)으로 보낸다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const subject = p.get("subject");
  const page = p.get("page");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  if (!subject) redirect("/");
  const db = await createClient();
  const n = page && /^\d+$/.test(page) ? Number(page) : null;

  let target: { storage_path: string; local: number | null } | null = null;
  if (n !== null) {
    const { data: part } = await db
      .from("subject_files")
      .select("storage_path, page_from")
      .eq("subject_id", subject)
      .lte("page_from", n)
      .gte("page_to", n)
      .order("page_from")
      .limit(1)
      .maybeSingle();
    if (part?.page_from) target = { storage_path: part.storage_path, local: n - part.page_from + 1 };
  }
  if (!target) {
    const { data: whole } = await db.from("subject_files").select("storage_path, page_offset").eq("subject_id", subject).eq("name", "book").maybeSingle();
    if (whole) target = { storage_path: whole.storage_path, local: n !== null ? n + whole.page_offset : null };
  }
  if (target) {
    const { data: signed } = await db.storage.from("sources").createSignedUrl(target.storage_path, 60 * 10);
    if (signed?.signedUrl) redirect(target.local ? `${signed.signedUrl}#page=${target.local}` : signed.signedUrl);
  }
  const fallback = new URLSearchParams();
  for (const k of ["subject", "unit", "page", "text"]) {
    const v = p.get(k);
    if (v) fallback.set(k, v);
  }
  redirect(`/sources/find?${fallback}`);
}
