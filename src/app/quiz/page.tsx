import { getCurrentUser } from "@/domains/auth/session";
import { resolveQuiz, type QuizParams } from "@/domains/quiz/resolve";
import { QuizRunner } from "@/domains/quiz/components/QuizRunner";

export const metadata = { title: "퀴즈" };

export default async function QuizPage({ searchParams }: { searchParams: Promise<QuizParams> }) {
  const p = await searchParams;
  const [user, quiz] = await Promise.all([getCurrentUser(), resolveQuiz(p)]);
  const subjectId = p.subject ?? quiz.questions[0]?.subject_id ?? null;
  const backHref = subjectId ? `/subjects/${subjectId}` : "/";
  return (
    <QuizRunner
      key={JSON.stringify(p)}
      questions={quiz.questions}
      title={quiz.title}
      subjectId={subjectId}
      isGuest={!user}
      backHref={backHref}
      seed={quiz.seed}
      resume={quiz.resume}
    />
  );
}
