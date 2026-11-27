import { listAllProfiles, listMembersOf } from "@/contexts/access/ui/loaders";
import { grantMemberAction, revokeMemberAction } from "@/contexts/access/ui/actions";
import { listAllSets, listSubjects } from "@/contexts/catalog/ui/loaders";
import { SubjectsAdmin } from "@/contexts/catalog/ui/components/SubjectsAdmin";

export const metadata = { title: "관리" };

export default async function AdminPage() {
  const [subjects, sets] = await Promise.all([listSubjects(), listAllSets()]);
  const [members, all] = await Promise.all([listMembersOf(subjects.map((s) => s.id)), listAllProfiles()]);
  const profiles = all.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, isAdmin: u.isAdmin }));
  return (
    <SubjectsAdmin
      subjects={subjects}
      members={members.map((m) => ({ subjectId: m.subjectId, userId: m.userId }))}
      profiles={profiles}
      sets={sets}
      grantMember={grantMemberAction}
      revokeMember={revokeMemberAction}
    />
  );
}
