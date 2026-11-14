import { notFound } from "next/navigation";
import { getSubject, getUnitTree, listCollections } from "@/domains/subjects/queries";
import { countQuestionsByCollection, countQuestionsByUnit, listSets } from "@/domains/questions/queries";
import { getCurrentUser } from "@/domains/auth/session";
import { QuizStart } from "@/domains/quiz/components/QuizStart";
import { buildTree } from "@/domains/shared/tree";
import { listUnfinishedSessions } from "@/domains/quiz/sessions";
import { getUnitProgress, getUnitRoundScores, getUnitRounds } from "@/domains/progress/queries";

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
    getUnitRounds(id),
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
