import { createClient } from "@/domains/auth/supabase/server";
import { SubjectsAdmin } from "@/domains/subjects/components/SubjectsAdmin";

export const metadata = { title: "관리" };

export default async function AdminPage() {
  const db = await createClient();
  const [{ data: subjects }, { data: members }, { data: profiles }, { data: sets }] = await Promise.all([
    db.from("subjects").select("*").order("created_at"),
    db.from("subject_members").select("subject_id, user_id"),
    db.from("profiles").select("id, email, display_name, is_admin").order("created_at"),
    db.from("question_sets").select("id, subject_id, title, created_at, questions(count)").order("created_at", { ascending: false }),
  ]);
  return (
    <SubjectsAdmin
      subjects={subjects ?? []}
      members={members ?? []}
      profiles={profiles ?? []}
      sets={(sets ?? []).map((s) => ({
        id: s.id,
        subject_id: s.subject_id,
        title: s.title,
        created_at: s.created_at,
        count: (s.questions as unknown as { count: number }[])?.[0]?.count ?? 0,
      }))}
    />
  );
}
