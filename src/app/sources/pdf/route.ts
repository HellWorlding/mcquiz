import { redirect } from "next/navigation";
import { getCurrentUser } from "@/domains/auth/session";
import { createClient } from "@/domains/auth/supabase/server";

/**
 * 주제의 원본 PDF 를 해당 쪽으로 연다: /sources/pdf?subject=<id>&page=<책 쪽수>[&unit=&text=]
 * 권한은 저장소 RLS(주제 권한)가 결정한다. PDF 가 없으면 텍스트 원문(/sources/find)으로 보낸다.
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
  const { data: file } = await db.from("subject_files").select("storage_path, page_offset").eq("subject_id", subject).eq("name", p.get("name") ?? "book").maybeSingle();
  if (file) {
    const { data: signed } = await db.storage.from("sources").createSignedUrl(file.storage_path, 60 * 10);
    if (signed?.signedUrl) {
      const n = page && /^\d+$/.test(page) ? Number(page) + file.page_offset : null;
      redirect(n ? `${signed.signedUrl}#page=${n}` : signed.signedUrl);
    }
  }
  const fallback = new URLSearchParams();
  for (const k of ["subject", "unit", "page", "text"]) {
    const v = p.get(k);
    if (v) fallback.set(k, v);
  }
  redirect(`/sources/find?${fallback}`);
}
