/** 사용량·비용 API 조립의 UTC 기간·threshold·conflict 정책을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  UsageCostOperationsError,
  UsageCostOperationsService,
} from './usage-cost-operations.service.js';

const settings = {
  currency: 'USD' as const,
  warningUsd: '15.000000',
  criticalUsd: '24.000000',
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

const overview = {
  estimatedCostUsd: '16.000000',
  inProgressJobCount: 2,
  failedRunCount: 1,
  pendingReviewCandidateCount: 4,
  breakdown: [],
};

const createService = () => {
  const query = {
    getOverview: vi.fn().mockResolvedValue(overview),
    getCurrentMonthEstimatedCost: vi.fn().mockResolvedValue('16.000000'),
  };
  const repository = {
    find: vi.fn().mockResolvedValue(settings),
    update: vi.fn().mockResolvedValue({ kind: 'UPDATED', settings }),
  };
  return {
    query,
    repository,
    service: new UsageCostOperationsService({
      query,
      settings: repository,
      now: () => new Date('2026-07-28T12:00:00.000Z'),
    }),
  };
};

describe('UsageCostOperationsService', () => {
  it('filter가 없으면 현재 UTC 달 범위와 threshold를 조립한다', async () => {
    const { query, service } = createService();

    await expect(service.overview({ role: 'ADMIN' }, {})).resolves.toEqual({
      range: {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      },
      ...overview,
      currentMonthThreshold: {
        range: {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-08-01T00:00:00.000Z',
        },
        estimatedCostUsd: '16.000000',
        status: 'WARNING',
      },
    });
    expect(query.getOverview).toHaveBeenCalledWith({
      range: {
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
  });

  it('custom range overview과 현재 월 threshold 비용을 분리한다', async () => {
    const { query, service } = createService();

    await service.overview(
      { role: 'ADMIN' },
      {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-07-01T00:00:00.000Z',
      },
    );
    expect(query.getCurrentMonthEstimatedCost).toHaveBeenCalledWith({
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it('현재 월 filter가 있어도 전체 월 비용으로 threshold를 계산한다', async () => {
    const { query, service } = createService();
    query.getCurrentMonthEstimatedCost.mockResolvedValueOnce('24.00000000');

    await expect(
      service.overview({ role: 'ADMIN' }, { source: 'TTS', status: 'FAILED' }),
    ).resolves.toMatchObject({
      estimatedCostUsd: '16.000000',
      currentMonthThreshold: {
        estimatedCostUsd: '24.00000000',
        status: 'CRITICAL',
      },
    });
    expect(query.getCurrentMonthEstimatedCost).toHaveBeenCalledWith({
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it('소수 8자리 월 비용을 micro USD 단위로 정확히 비교한다', async () => {
    const { query, service } = createService();
    query.getCurrentMonthEstimatedCost.mockResolvedValueOnce('15.00000000');

    await expect(
      service.overview({ role: 'ADMIN' }, { source: 'AI' }),
    ).resolves.toMatchObject({
      currentMonthThreshold: {
        estimatedCostUsd: '15.00000000',
        status: 'WARNING',
      },
    });
  });

  it('partial UTC range와 non-admin update를 stable 오류로 거절한다', async () => {
    const { service } = createService();

    await expect(
      service.overview({ role: 'ADMIN' }, { from: '2026-07-01T00:00:00.000Z' }),
    ).rejects.toEqual(new UsageCostOperationsError('USAGE_COST_RANGE_INVALID'));
    await expect(service.settings({ role: 'LEARNER' })).rejects.toEqual(
      new UsageCostOperationsError('ADMIN_REQUIRED'),
    );
  });

  it('repository conflict를 settings conflict로 유지한다', async () => {
    const { repository, service } = createService();
    repository.update.mockResolvedValueOnce({ kind: 'CONFLICT' });

    await expect(
      service.updateSettings(
        {
          role: 'ADMIN',
          userId: '00000000-0000-4000-8000-000000000001',
          sub: 'admin-sub',
        },
        {
          warningUsd: '16.000000',
          criticalUsd: '25.000000',
          expectedUpdatedAt: '2026-07-01T00:00:00.000Z',
          requestId: '00000000-0000-4000-8000-000000000002',
        },
      ),
    ).rejects.toEqual(
      new UsageCostOperationsError('OPERATIONS_COST_SETTINGS_CONFLICT'),
    );
  });
});
