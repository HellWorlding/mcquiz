import type { CurrentUser, SubjectId, UserId } from "../domain/user";

export type Member = { userId: UserId; email: string | null; displayName: string | null; since: string };

export type ProfileRepo = {
  byId(id: UserId): Promise<CurrentUser | null>;
  /** 이메일로 사용자 찾기 (관리자 기능, service role 필요) */
  findByEmail(email: string): Promise<{ id: UserId; email: string } | null>;
};

export type MembershipRepo = {
  list(subjectId: SubjectId): Promise<Member[]>;
  isMember(subjectId: SubjectId, userId: UserId): Promise<boolean>;
  grant(subjectId: SubjectId, userId: UserId): Promise<void>;
  revoke(subjectId: SubjectId, userId: UserId): Promise<void>;
};

export type AccessDeps = {
  user: CurrentUser | null;
  profiles: ProfileRepo;
  members: MembershipRepo;
};
