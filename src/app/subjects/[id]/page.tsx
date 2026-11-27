import { notFound } from "next/navigation";
import { getCurrentUser } from "@/contexts/access/server";
import { buildTree } from "@/contexts/catalog";
import { countQuestionsByCollection, countQuestionsByUnit, getSubject, getUnitTree, listCollections, listSets } from "@/contexts/catalog/ui/loaders";
import { getUnitAttemptCounts, getUnitProgress, getUnitRoundScores, listUnfinishedSessions } from "@/contexts/learning/ui/loaders";
import { QuizStart } from "@/contexts/learning/ui/components/QuizStart";

export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subject = await getSubject(id);
  if (!subject) notFound();
  const [units, sets, collections, unitCounts, collectionCounts, user, sessions, unitRounds, unitProgress, unitRoundScores] = await Promise.all([
    getUnitTree(id),
    listSets(id),
    listCollections(id),
    countQuestionsByUnit(id),
    countQuestionsByCollection(id),
    getCurrentUser(),
    listUnfinishedSessions(id),
    getUnitAttemptCounts(id),
    getUnitProgress(id),
    getUnitRoundScores(id),
  ]);
  return (
    <QuizStart
      subject={subject}
      units={units}
      sets={sets}
      collections={buildTree(collections)}
      unitCounts={unitCounts}
      unitRounds={unitRounds}
      unitProgress={unitProgress}
      unitRoundScores={unitRoundScores}
      collectionCounts={collectionCounts}
      user={user ? { id: user.id, isAdmin: user.isAdmin } : null}
      sessions={sessions}
    />
  );
}
