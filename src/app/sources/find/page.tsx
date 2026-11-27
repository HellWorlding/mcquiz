import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/contexts/access/server";
import { locateSourceHref } from "@/contexts/knowledge/ui/loaders";
import { getT } from "@/shared/i18n/server";

export const metadata = { title: "원문 보기" };

/**
 * 문항의 "근거 · 책 p.N" 에서 원문으로 가는 중간 경로.
 * 책 쪽수가 있으면 그 쪽의 조각(또는 교재 PDF)으로, 없으면 근거 문장으로 자료를 검색해 가장 가까운 조각으로 보낸다.
 */
export default async function FindSourcePage({ searchParams }: { searchParams: Promise<{ subject?: string; unit?: string; page?: string; text?: string }> }) {
  const { subject, unit, page, text } = await searchParams;
  const qs = new URLSearchParams(Object.entries({ subject, unit, page, text }).filter((e): e is [string, string] => !!e[1]));
  await requireUser(`/sources/find?${qs}`);
  const t = await getT();
  const href = await locateSourceHref({ subject, unit, page, text });
  if (href) redirect(href);
  return (
    <div className="card flex flex-col gap-2">
      <p className="text-muted">{t("source.not_found")}</p>
      {subject && (
        <Link href={`/subjects/${subject}`} className="btn-secondary self-start">
          {t("source.back")}
        </Link>
      )}
    </div>
  );
}
