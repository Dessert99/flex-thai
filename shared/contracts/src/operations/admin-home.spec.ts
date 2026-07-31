/** 관리자 홈 운영 집계가 안전한 수치와 인증 상태만 노출하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { adminHomeOperationsResponseSchema } from './admin-home.js';

const response = {
  feedback: { pendingCount: 2 },
  candidates: {
    questionPendingCount: 3,
    vocabularyPendingCount: 4,
  },
  contentProduction: { runningCount: 1, failedCount: 2 },
  tts: { runningCount: 5, failedCount: 1 },
  mfa: {
    enrolled: true,
    enrolledAt: '2026-07-01T00:00:00.000Z',
    recentVerificationAt: null,
  },
} as const;

describe('관리자 홈 운영 집계 계약', () => {
  it('오류 신고·후보·작업·MFA 상태만 허용한다', () => {
    expect(adminHomeOperationsResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      adminHomeOperationsResponseSchema.parse({
        ...response,
        usageCost: { estimatedCostUsd: '16.500000', status: 'WARNING' },
      }),
    ).toThrow();
  });

  it('음수 집계와 내부 작업 식별자를 거절한다', () => {
    expect(() =>
      adminHomeOperationsResponseSchema.parse({
        ...response,
        feedback: { pendingCount: -1 },
      }),
    ).toThrow();
    expect(() =>
      adminHomeOperationsResponseSchema.parse({
        ...response,
        internalJobIds: ['01933b6a-8f13-7a19-b7e5-536d70f57aaa'],
      }),
    ).toThrow();
  });
});
