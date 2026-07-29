/** 사용량·비용 공개 계약의 filter·금액·민감 정보 경계를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  operationsCostSettingsResponseSchema,
  updateOperationsCostSettingsRequestSchema,
  usageCostOverviewQuerySchema,
  usageCostOverviewResponseSchema,
} from './usage-cost.js';

const validOverview = {
  range: {
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-08-01T00:00:00.000Z',
  },
  estimatedCostUsd: '3.250000',
  inProgressJobCount: 2,
  failedRunCount: 1,
  pendingReviewCandidateCount: 4,
  breakdown: [
    {
      source: 'TTS',
      provider: 'local',
      model: 'deterministic-v1',
      voice: 'thai-female',
      runCount: 1,
      estimatedCostUsd: '3.250000',
    },
  ],
  currentMonthThreshold: {
    range: {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    },
    estimatedCostUsd: '3.250000',
    status: 'NORMAL',
  },
} as const;

describe('사용량·비용 계약', () => {
  it('UTC 기간과 AI·TTS 실행 filter를 strict하게 검증한다', () => {
    expect(
      usageCostOverviewQuerySchema.parse({
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
        source: 'TTS',
        provider: 'local',
        model: 'deterministic-v1',
        voice: 'thai-female',
        status: 'SUCCEEDED',
      }),
    ).toMatchObject({ source: 'TTS', status: 'SUCCEEDED' });
    expect(
      usageCostOverviewQuerySchema.safeParse({ unexpected: true }).success,
    ).toBe(false);
    expect(
      usageCostOverviewQuerySchema.safeParse({
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-07-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      usageCostOverviewQuerySchema.safeParse({
        source: 'AI',
        voice: 'thai-female',
      }).success,
    ).toBe(false);
  });

  it('overview에서 안전한 breakdown만 허용한다', () => {
    expect(() =>
      usageCostOverviewResponseSchema.parse(validOverview),
    ).not.toThrow();
    expect(
      usageCostOverviewResponseSchema.safeParse({
        ...validOverview,
        breakdown: [
          { ...validOverview.breakdown[0], providerRequestId: 'private-id' },
        ],
      }).success,
    ).toBe(false);
  });

  it('TTS 저장소의 소수 8자리 예상 비용을 손실 없이 허용한다', () => {
    expect(
      usageCostOverviewResponseSchema.parse({
        ...validOverview,
        estimatedCostUsd: '15.00000000',
        breakdown: [
          {
            ...validOverview.breakdown[0],
            estimatedCostUsd: '0.00000100',
          },
        ],
        currentMonthThreshold: {
          ...validOverview.currentMonthThreshold,
          estimatedCostUsd: '15.00000000',
          status: 'WARNING',
        },
      }),
    ).toMatchObject({
      estimatedCostUsd: '15.00000000',
      breakdown: [{ estimatedCostUsd: '0.00000100' }],
    });
  });

  it('USD 경고 기준은 양수이며 warning보다 critical이 커야 한다', () => {
    expect(() =>
      operationsCostSettingsResponseSchema.parse({
        currency: 'USD',
        warningUsd: '15.000000',
        criticalUsd: '24.000000',
        updatedAt: '2026-07-28T00:00:00.000Z',
      }),
    ).not.toThrow();
    expect(
      updateOperationsCostSettingsRequestSchema.safeParse({
        warningUsd: '24.000000',
        criticalUsd: '24.000000',
        expectedUpdatedAt: '2026-07-28T00:00:00.000Z',
        requestId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
  });
});
