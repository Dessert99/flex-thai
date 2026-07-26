/** Identity use case와 전달 계층이 사용하는 사용자 저장 port를 정의한다 */

/** Cognito sub에 연결된 최신 애플리케이션 사용자 */
export interface IdentityUser {
  id: string;
  cognitoSub: string;
  email: string;
  role: 'LEARNER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  mfaEnrolledAt: Date | null;
}

/** 관리자 목록에서 사용자 생성·변경 시각을 포함한 신원 */
export interface ManagedIdentityUser extends IdentityUser {
  createdAt: Date;
  updatedAt: Date;
}

/** 관리자 사용자 검색·필터·페이지 입력 */
export interface ManagedIdentityUserListQuery {
  query?: string;
  role?: IdentityUser['role'];
  status?: IdentityUser['status'];
  mfaEnrolled?: boolean;
  page: number;
  pageSize: number;
}

/** 관리자 사용자 페이지 */
export interface ManagedIdentityUserPage {
  items: ManagedIdentityUser[];
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/** 원자적 사용자 변경 저장 결과 */
export type ManagedIdentityUserChangeResult =
  | { kind: 'UPDATED'; user: ManagedIdentityUser }
  | { kind: 'UNCHANGED'; user: ManagedIdentityUser }
  | { kind: 'NOT_FOUND' }
  | { kind: 'SELF_LOCKOUT' }
  | { kind: 'LAST_ACTIVE_ADMIN' };

/** Identity 인증과 guard가 최신 사용자 상태를 조회·갱신하는 저장 port */
export interface IdentityUserRepository {
  findBySub(subject: string): Promise<IdentityUser | null>;
  upsertIdentity(input: {
    subject: string;
    email: string;
  }): Promise<IdentityUser>;
  markMfaEnrolled(subject: string, enrolledAt: Date): Promise<IdentityUser>;
}

/** 관리자 사용자 목록과 활성 상태를 변경하는 저장 port */
export interface IdentityUserManagementRepository {
  listManagedUsers(
    query: ManagedIdentityUserListQuery,
  ): Promise<ManagedIdentityUserPage>;
  changeStatusWithAudit(input: {
    actorSub: string;
    actorUserId: string;
    occurredAt: Date;
    requestId: string;
    status: IdentityUser['status'];
    userId: string;
  }): Promise<ManagedIdentityUserChangeResult>;
  changeRoleWithAudit(input: {
    actorSub: string;
    actorUserId: string;
    occurredAt: Date;
    requestId: string;
    role: IdentityUser['role'];
    userId: string;
  }): Promise<ManagedIdentityUserChangeResult>;
}
