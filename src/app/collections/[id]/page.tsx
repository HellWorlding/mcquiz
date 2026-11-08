import { notFound } from "next/navigation";
import { createClient } from "@/domains/auth/supabase/server";
import { requireUser } from "@/domains/auth/session";
import { getQuestionsByIds } from "@/domains/questions/queries";
import { CollectionView } from "@/domains/subjects/components/CollectionView";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = await createClient();
  const { data: col } = await db.from("collections").select("*").eq("id", id).maybeSingle();
  if (!col) notFound();
  const { data: items } = await db.from("collection_items").select("question_id, added_at").eq("collection_id", id).order("added_at");
  const questions = await getQuestionsByIds((items ?? []).map((i) => i.question_id));
  return <CollectionView collection={col} questions={questions} canEdit={user.isAdmin || col.created_by === user.id} />;
}
