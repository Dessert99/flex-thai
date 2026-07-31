/** 관리자 홈 service의 운영·비용·MFA 공개 조립을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { AdminHomeService } from './admin-home.service.js';

const actor = {
  userId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
  role: 'ADMIN' as const,
  mfaEnrolledAt: new Date('2026-07-01T00:00:00.000Z'),
};

describe('AdminHomeService', () => {
  it('DB 전체 집계와 현재 월 비용 경고 및 현재 MFA 등록 상태를 조립한다', async () => {
    const query = {
      getOperationsSummary: vi.fn().mockResolvedValue({
        pendingErrorReportCount: 2,
        pendingQuestionCandidateCount: 3,
        pendingVocabularyCandidateCount: 4,
        runningContentJobCount: 1,
        failedContentJobCount: 2,
        runningTtsJobCount: 5,
        failedTtsJobCount: 1,
      }),
    };
    const usageCost = {
      overview: vi.fn().mockResolvedValue({
        currentMonthThreshold: {
          estimatedCostUsd: '16.500000',
          status: 'WARNING',
        },
      }),
    };

    await expect(
      new AdminHomeService({ query, usageCost }).get(actor),
    ).resolves.toEqual({
      feedback: { pendingCount: 2 },
      candidates: {
        questionPendingCount: 3,
        vocabularyPendingCount: 4,
      },
      contentProduction: { runningCount: 1, failedCount: 2 },
      tts: { runningCount: 5, failedCount: 1 },
      usageCost: { estimatedCostUsd: '16.500000', status: 'WARNING' },
      mfa: {
        enrolled: true,
        enrolledAt: '2026-07-01T00:00:00.000Z',
        recentVerificationAt: null,
      },
    });
    expect(usageCost.overview).toHaveBeenCalledWith({ role: 'ADMIN' }, {});
  });
});
