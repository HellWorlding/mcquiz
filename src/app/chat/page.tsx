import { requireUser } from "@/domains/auth/session";
import { createClient } from "@/domains/auth/supabase/server";
import { getSubject, listSubjects } from "@/domains/subjects/queries";
import { hasOpenAI } from "@/domains/shared/env";
import { ChatPanel } from "@/domains/evidence/components/ChatPanel";
import { getAiQuota } from "@/domains/evidence/quota";
import { getAiMode } from "@/domains/evidence/mode";

export const metadata = { title: "AI에게 묻기" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ subject?: string; question?: string }> }) {
  const user = await requireUser("/chat");
  const { subject, question } = await searchParams;
  const quota = await getAiQuota(user);
  const current = subject ? await getSubject(subject) : (await listSubjects())[0] ?? null;
  if (!current) return <p className="card text-muted">볼 수 있는 주제가 없습니다.</p>;
  const db = await createClient();
  const mode = await getAiMode(db, current.id);
  let prompt: string | null = null;
  if (question) {
    const { data } = await db.from("questions").select("prompt").eq("id", question).maybeSingle();
    prompt = data?.prompt ?? null;
  }
  return (
    <ChatPanel subjectId={current.id} subjectName={current.name} questionId={question ?? null} questionPrompt={prompt} aiEnabled={hasOpenAI()} initialQuota={quota} mode={mode} />
  );
}
