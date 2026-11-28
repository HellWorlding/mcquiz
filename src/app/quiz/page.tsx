import { getCurrentUser } from "@/contexts/access/server";
import { hashString } from "@/contexts/learning";
import { loadQuiz, type QuizSearchParams } from "@/contexts/learning/ui/loaders";
import { QuizRunner } from "@/contexts/learning/ui/components/QuizRunner";

export const metadata = { title: "퀴즈" };

export default async function QuizPage({ searchParams }: { searchParams: Promise<QuizSearchParams> }) {
  const [user, quiz] = await Promise.all([getCurrentUser(), loadQuiz(await searchParams)]);
  const backHref = quiz.subjectId ? `/subjects/${quiz.subjectId}` : "/";
  return (
    <QuizRunner
      // 같은 문항 목록이면 같은 key: 첫 답을 저장하며 주소가 ?ids= → ?session= 으로 바뀌거나,
      // 언어 전환처럼 서버가 화면을 다시 그려도 풀이 상태(답·스톱워치·지운 선지)가 유지된다
      key={`${quiz.questions.length}:${hashString(quiz.questions.map((q) => q.id).join(","))}`}
      questions={quiz.questions}
      title={quiz.title}
      subjectId={quiz.subjectId}
      isGuest={!user}
      guestLimit={quiz.guestLimit}
      guestLocked={quiz.guestLocked}
      guestQuizKey={quiz.guestQuizKey}
      quizKey={quiz.quizKey}
      isAdmin={user?.isAdmin ?? false}
      backHref={backHref}
      seed={quiz.seed}
      resume={quiz.resume}
      notes={quiz.notes}
      savedIds={quiz.savedIds}
      unitLabels={quiz.unitLabels}
      confusedIds={quiz.confusedIds}
      questionNumbers={quiz.questionNumbers}
    />
  );
}
