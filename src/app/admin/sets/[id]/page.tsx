import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/domains/auth/supabase/server";
import { buildTree } from "@/domains/shared/tree";
import { SetEditor } from "@/domains/questions/components/SetEditor";

export default async function SetAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: set } = await db.from("question_sets").select("*").eq("id", id).maybeSingle();
  if (!set) notFound();
  const [{ data: questions }, { data: units }] = await Promise.all([
    db.from("questions").select("*, choices(*)").eq("set_id", id).order("ord"),
    db.from("units").select("*").eq("subject_id", set.subject_id),
  ]);
  const qs = (questions ?? []).map((q) => ({ ...q, choices: [...(q.choices ?? [])].sort((a, b) => a.ord - b.ord) }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{set.title}</h1>
          <p className="text-sm text-muted">
            {qs.length}문항 {set.source_filename && `· ${set.source_filename}`}
          </p>
        </div>
        <Link href={`/quiz?set=${set.id}&count=all&order=seq`} className="btn-primary btn-sm">
          풀어보기
        </Link>
      </div>
      <SetEditor set={set} questions={qs} unitTree={buildTree(units ?? [])} />
    </div>
  );
}
