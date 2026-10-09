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

/** Identity 인증과 guard가 최신 사용자 상태를 조회·갱신하는 저장 port */
export interface IdentityUserRepository {
  findBySub(subject: string): Promise<IdentityUser | null>;
  upsertIdentity(input: {
    subject: string;
    email: string;
  }): Promise<IdentityUser>;
  markMfaEnrolled(subject: string, enrolledAt: Date): Promise<IdentityUser>;
}
