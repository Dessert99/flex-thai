/** Cognito sub와 애플리케이션 role·status의 DB 경계를 정의한다 */

/** 인증 guard와 관리자 정책이 사용하는 애플리케이션 사용자 */
export interface ApplicationUser {
  id: string;
  cognitoSub: string;
  email: string;
  role: 'LEARNER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  phoneVerifiedAt: Date | null;
  mfaEnrolledAt: Date | null;
}

/** Cognito claim을 변경 불가능한 sub 기준 사용자로 연결한다 */
export interface UserRepository {
  findBySub(subject: string): Promise<ApplicationUser | null>;
  upsertIdentity(input: {
    subject: string;
    email: string;
  }): Promise<ApplicationUser>;
  markPhoneVerified(
    subject: string,
    verifiedAt: Date,
  ): Promise<ApplicationUser>;
}

/** 최초 ADMIN role 변경과 audit log를 한 transaction에 묶는다 */
export interface AdminBootstrapRepository {
  bootstrapAdmin(subject: string, requestId: string): Promise<void>;
}
