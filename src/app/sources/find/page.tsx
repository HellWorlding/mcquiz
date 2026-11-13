import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/domains/auth/session";
import { createClient } from "@/domains/auth/supabase/server";
import { findEvidence } from "@/domains/evidence/search";
import { tokenize } from "@/domains/import/tokenize";
import { getT } from "@/domains/shared/i18n-server";

export const metadata = { title: "원문 보기" };

/**
 * 문항의 "근거 · 책 p.N" 에서 원문으로 가는 중간 경로.
 * 책 쪽수가 있으면 그 쪽의 조각으로, 없으면 근거 문장으로 자료를 검색해 가장 가까운 조각으로 보낸다.
 */
export default async function FindSourcePage({ searchParams }: { searchParams: Promise<{ subject?: string; unit?: string; page?: string; text?: string }> }) {
  const { subject, unit, page, text } = await searchParams;
  const qs = new URLSearchParams(Object.entries({ subject, unit, page, text }).filter((e): e is [string, string] => !!e[1]));
  await requireUser(`/sources/find?${qs}`);
  const t = await getT();
  if (subject) {
    const db = await createClient();
    const q = text ? `&q=${encodeURIComponent(text.slice(0, 200))}` : "";
    if (page && /^\d+$/.test(page)) {
      const { data } = await db.from("source_chunks").select("id, source_id, unit_id, content").eq("subject_id", subject).eq("page", Number(page)).order("ord").limit(30);
      if (data?.length) {
        // 같은 쪽에 조각이 여럿이면: 단원이 맞고, 근거 문장의 단어가 가장 많이 들어 있는 조각
        const toks = text ? tokenize(text) : [];
        const score = (c: (typeof data)[number]) => (unit && c.unit_id === unit ? 1000 : 0) + toks.filter((tk) => c.content.includes(tk)).length;
        const hit = [...data].sort((a, b) => score(b) - score(a))[0];
        redirect(`/sources/${hit.source_id}?chunk=${hit.id}&page=${page}${q}`);
      }
    }
    if (text) {
      const hits = await findEvidence(db, { subjectId: subject, unitIds: unit ? [unit] : null, query: text, limit: 1 });
      if (hits[0]) redirect(`/sources/${hits[0].sourceId}?chunk=${hits[0].chunkId}${q}`);
    }
  }
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
