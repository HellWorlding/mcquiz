import { notFound } from "next/navigation";
import { requireUser } from "@/contexts/access/server";
import { getCollection, listCollectionQuestions } from "@/contexts/catalog/ui/loaders";
import { CollectionView } from "@/contexts/catalog/ui/components/CollectionView";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection) notFound();
  const questions = await listCollectionQuestions(id);
  return <CollectionView collection={collection} questions={questions} canEdit={user.isAdmin || collection.createdBy === user.id} />;
}
