import type { CurrentUser, SubjectId, UserId } from "../domain/user";

export type Member = { userId: UserId; email: string | null; displayName: string | null; since: string };

export type ProfileRepo = {
  byId(id: UserId): Promise<CurrentUser | null>;
  /** 이메일로 사용자 찾기 (관리자 기능, service role 필요) */
  findByEmail(email: string): Promise<{ id: UserId; email: string } | null>;
  /** 가입 사용자 전체 (관리자 화면·CLI). 비관리자 세션에서는 RLS 로 자기 것만 나온다 */
  listAll(): Promise<CurrentUser[]>;
  /** 관리자 플래그 (service role 필요 — 트리거가 일반 세션의 변경을 막는다) */
  setAdmin(userId: UserId, on: boolean): Promise<void>;
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
