import { redirect } from "next/navigation";

/** 옛 주소 /weak → /saved (쿼리 유지). 저장함 라우트 이름 변경 (용어사전 G) */
export default async function WeakRedirectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) for (const x of v) qs.append(k, x);
  }
  const q = qs.toString();
  redirect(q ? `/saved?${q}` : "/saved");
}
