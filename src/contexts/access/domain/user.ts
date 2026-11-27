/** Access 도메인: 현재 사용자와 가시성 규칙 (순수) */
export type UserId = string;
export type SubjectId = string;

export type CurrentUser = {
  id: UserId;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  /** AI 질문 한도 개인 설정 (null = 기본) */
  aiLimit: number | null;
};

export type Visibility = "public" | "restricted";

/**
 * A2. 과목 가시성: 관리자는 전부, 로그인 사용자는 public, restricted 는 멤버만, 게스트는 guestAccess 가 켜졌을 때 public 만.
 * DB 의 access.readable_subject_ids() 와 같은 규칙이다 (RLS 가 최종 결정, 이 함수는 화면·테스트용).
 */
export function canReadSubject(
  user: CurrentUser | null,
  subject: { visibility: Visibility },
  isMember: boolean,
  guestAccess = false,
): boolean {
  if (user?.isAdmin) return true;
  if (subject.visibility === "public") return user ? true : guestAccess;
  return !!user && isMember;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
