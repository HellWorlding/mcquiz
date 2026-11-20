import { getCurrentUser } from "@/domains/auth/session";
import { resolveQuiz, type QuizParams } from "@/domains/quiz/resolve";
import { QuizRunner } from "@/domains/quiz/components/QuizRunner";
import { getNotesFor } from "@/domains/notes/queries";
import { getSavedIdsFor } from "@/domains/progress/queries";
import { listUnits } from "@/domains/subjects/queries";
import { unitPathLabel } from "@/domains/shared/labels";

export const metadata = { title: "퀴즈" };

export default async function QuizPage({ searchParams }: { searchParams: Promise<QuizParams> }) {
  const p = await searchParams;
  const [user, quiz] = await Promise.all([getCurrentUser(), resolveQuiz(p)]);
  const ids = quiz.questions.map((q) => q.id);
  const [notes, savedIds] = user ? await Promise.all([getNotesFor(ids), getSavedIdsFor(ids)]) : [{}, []];
  const subjectId = p.subject ?? quiz.questions[0]?.subject_id ?? null;
  // 풀이 화면 위에 "몇 단원"인지 작게 보여 주기 위한 단원 라벨
  const units = subjectId ? await listUnits(subjectId) : [];
  const unitLabels: Record<string, string> = {};
  for (const q of quiz.questions) {
    if (q.unit_id && !(q.unit_id in unitLabels)) unitLabels[q.unit_id] = unitPathLabel(units, q.unit_id) ?? "";
  }
  const backHref = subjectId ? `/subjects/${subjectId}` : "/";
  return (
    <QuizRunner
      key={JSON.stringify(p)}
      questions={quiz.questions}
      title={quiz.title}
      subjectId={subjectId}
      isGuest={!user}
      isAdmin={user?.isAdmin ?? false}
      backHref={backHref}
      seed={quiz.seed}
      resume={quiz.resume}
      notes={notes}
      savedIds={savedIds}
      unitLabels={unitLabels}
    />
  );
}
