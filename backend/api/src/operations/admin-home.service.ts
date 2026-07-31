/** 관리자 홈의 DB 집계와 비용·MFA 상태를 공개 응답으로 조립한다 */
import {
  adminHomeOperationsResponseSchema,
  type AdminHomeOperationsResponse,
} from '@flex-thia/contracts';
import type { DrizzleAdminHomeQuery } from '@flex-thia/database';

/** 관리자 홈 service가 요구하는 read adapter */
export interface AdminHomeServiceDependencies {
  query: Pick<DrizzleAdminHomeQuery, 'getOperationsSummary'>;
}

/** 관리자 홈에 전체 운영 상태를 노출하는 read facade */
export class AdminHomeService {
  constructor(private readonly dependencies: AdminHomeServiceDependencies) {}

  /** 현재 관리자의 운영 집계와 MFA 상태를 반환한다 */
  async get(actor: {
    userId: string;
    role: 'ADMIN';
    mfaEnrolledAt: Date | null;
  }): Promise<AdminHomeOperationsResponse> {
    const operations = await this.dependencies.query.getOperationsSummary(
      actor.userId,
    );

    return adminHomeOperationsResponseSchema.parse({
      feedback: { pendingCount: operations.pendingErrorReportCount },
      candidates: {
        questionPendingCount: operations.pendingQuestionCandidateCount,
        vocabularyPendingCount: operations.pendingVocabularyCandidateCount,
      },
      contentProduction: {
        runningCount: operations.runningContentJobCount,
        failedCount: operations.failedContentJobCount,
      },
      tts: {
        runningCount: operations.runningTtsJobCount,
        failedCount: operations.failedTtsJobCount,
      },
      mfa: {
        enrolled: actor.mfaEnrolledAt !== null,
        enrolledAt: actor.mfaEnrolledAt?.toISOString() ?? null,
        recentVerificationAt:
          operations.recentVerificationAt?.toISOString() ?? null,
      },
    });
  }
}
