import { redirect } from "next/navigation";
import { requireUser } from "@/contexts/access/server";
import { getSubject, listSubjects } from "@/contexts/catalog/ui/loaders";
import { loadChatPage } from "@/contexts/knowledge/ui/loaders";
import { ChatPanel } from "@/contexts/knowledge/ui/components/ChatPanel";

export const metadata = { title: "AI에게 묻기" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ subject?: string; question?: string }> }) {
  await requireUser("/chat");
  const { subject, question } = await searchParams;
  const current = subject ? await getSubject(subject) : (await listSubjects())[0] ?? null;
  if (!current) return <p className="card text-muted">볼 수 있는 주제가 없습니다.</p>;
  const data = await loadChatPage(current.id, current.name, question ?? null);
  if (!data) redirect("/login?next=%2Fchat");
  return (
    <ChatPanel
      subjectId={data.subjectId}
      subjectName={data.subjectName}
      questionId={data.questionId}
      question={data.question}
      aiEnabled={data.aiEnabled}
      initialQuota={data.quota}
      mode={data.mode}
      initialTurns={data.history}
    />
  );
}
