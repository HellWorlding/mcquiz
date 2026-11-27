import { listMembersOf } from "@/contexts/access/ui/loaders";
import { grantMemberAction, revokeMemberAction } from "@/contexts/access/ui/actions";
import { listAllSets, listSubjects } from "@/contexts/catalog/ui/loaders";
import { SubjectsAdmin } from "@/contexts/catalog/ui/components/SubjectsAdmin";

export const metadata = { title: "관리" };

export default async function AdminPage() {
  const [subjects, sets] = await Promise.all([listSubjects(), listAllSets()]);
  const members = await listMembersOf(subjects.map((s) => s.id));
  // 가입 사용자 목록은 Access 에 "전체 프로필" 포트가 없어 멤버로 등록된 사용자만 보인다 (팀장 결정 필요)
  const profiles = [...new Map(members.map((m) => [m.userId, { id: m.userId, email: m.email, displayName: m.displayName, isAdmin: false }])).values()];
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
