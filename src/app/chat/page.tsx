import { requireUser } from "@/domains/auth/session";
import { createClient } from "@/domains/auth/supabase/server";
import { getSubject, listSubjects } from "@/domains/subjects/queries";
import { hasOpenAI } from "@/domains/shared/env";
import { ChatPanel, type ChatQuestion, type Turn } from "@/domains/evidence/components/ChatPanel";
import { getAiQuota } from "@/domains/evidence/quota";
import { getAiMode } from "@/domains/evidence/mode";
import { plainText } from "@/domains/evidence/plain";

export const metadata = { title: "AI에게 묻기" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ subject?: string; question?: string }> }) {
  const user = await requireUser("/chat");
  const { subject, question } = await searchParams;
  const quota = await getAiQuota(user);
  const current = subject ? await getSubject(subject) : (await listSubjects())[0] ?? null;
  if (!current) return <p className="card text-muted">볼 수 있는 주제가 없습니다.</p>;
  const db = await createClient();
  const mode = await getAiMode(db, current.id);
  let q: ChatQuestion | null = null;
  let history: Turn[] = [];
  if (question) {
    const { data: past } = await db
      .from("ai_questions")
      .select("question, answer, created_at")
      .eq("user_id", user.id)
      .eq("question_id", question)
      .order("created_at", { ascending: false })
      .limit(6);
    history = (past ?? [])
      .reverse()
      .flatMap((r): Turn[] => (r.answer ? [{ role: "user", content: r.question, saved: true }, { role: "assistant", content: plainText(r.answer), saved: true }] : [{ role: "user", content: r.question, saved: true }]));
    const { data } = await db.from("questions").select("prompt, explanation, correct_choice, choices(ord, text)").eq("id", question).maybeSingle();
    if (data)
      q = {
        prompt: data.prompt,
        explanation: data.explanation,
        choices: [...(data.choices ?? [])].sort((a, b) => a.ord - b.ord).map((c) => ({ ord: c.ord, text: c.text, correct: c.ord === data.correct_choice })),
      };
  }
  return <ChatPanel subjectId={current.id} subjectName={current.name} questionId={q ? question ?? null : null} question={q} aiEnabled={hasOpenAI()} initialQuota={quota} mode={mode} initialTurns={history} />;
}
