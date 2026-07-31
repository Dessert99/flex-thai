/** 관리자 홈의 DB 집계와 비용·MFA 상태를 공개 응답으로 조립한다 */
import {
  adminHomeOperationsResponseSchema,
  type AdminHomeOperationsResponse,
} from '@flex-thia/contracts';
import type { DrizzleAdminHomeQuery } from '@flex-thia/database';
import type { UsageCostOperationsService } from './usage-cost-operations.service.js';

/** 관리자 홈 service가 요구하는 read adapter */
export interface AdminHomeServiceDependencies {
  query: Pick<DrizzleAdminHomeQuery, 'getOperationsSummary'>;
  usageCost: Pick<UsageCostOperationsService, 'overview'>;
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
    const [operations, usageCost] = await Promise.all([
      this.dependencies.query.getOperationsSummary(),
      this.dependencies.usageCost.overview({ role: actor.role }, {}),
    ]);

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
      usageCost: {
        estimatedCostUsd: usageCost.currentMonthThreshold.estimatedCostUsd,
        status: usageCost.currentMonthThreshold.status,
      },
      mfa: {
        enrolled: actor.mfaEnrolledAt !== null,
        enrolledAt: actor.mfaEnrolledAt?.toISOString() ?? null,
        // action-level 재인증 시각은 저장하지 않으므로 성공 상태를 추측하지 않는다.
        recentVerificationAt: null,
      },
    });
  }
}
