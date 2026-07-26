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
  listManagedUsers(): Promise<ManagedIdentityUser[]>;
  changeStatusWithAudit(input: {
    action: 'IDENTITY_USER_ENABLED' | 'IDENTITY_USER_DISABLED';
    actorSub: string;
    actorUserId: string;
    occurredAt: Date;
    requestId: string;
    status: IdentityUser['status'];
    userId: string;
  }): Promise<ManagedIdentityUser | null>;
}
