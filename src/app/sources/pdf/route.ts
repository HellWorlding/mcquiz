import { redirect } from "next/navigation";
import { getCurrentUser } from "@/contexts/access/server";
import { pdfRedirectHref } from "@/contexts/knowledge/ui/loaders";

/**
 * 교재 PDF 를 교재 쪽수 자리로 연다: /sources/pdf?subject=<id>&page=<교재 쪽수>[&unit=&text=]
 * 단원별로 잘라 올린 파일(page_from~page_to) 중 그 쪽이 든 것만 내려 주고, 파일 안의 쪽(#page=N)으로 간다.
 * 권한은 저장소 RLS(과목 권한)가 결정한다. 파일이 없으면 텍스트 원문(/sources/find)으로 보낸다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  redirect(
    await pdfRedirectHref({
      subject: p.get("subject") ?? undefined,
      unit: p.get("unit") ?? undefined,
      page: p.get("page") ?? undefined,
      text: p.get("text") ?? undefined,
    }),
  );
}
