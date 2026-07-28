/** 사용량·비용 overview와 독립 settings 상태의 사용자 표시를 검증한다 */
import { screen } from '@testing-library/react';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@flex-thia/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flex-thia/contracts')>()),
  usageCostOverviewResponseSchema: z.object({}).passthrough(),
  operationsCostSettingsResponseSchema: z.object({}).passthrough(),
  updateOperationsCostSettingsRequestSchema: z.object({}).passthrough(),
  usageCostOverviewQuerySchema: z.object({}).passthrough(),
}));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

import { UsageCostOperationsPage } from './UsageCostOperationsPage';

const overview = {
  range: {
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-08-01T00:00:00.000Z',
  },
  estimatedCostUsd: '16.000000',
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
      estimatedCostUsd: '16.000000',
    },
  ],
  currentMonthThreshold: {
    range: {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    },
    estimatedCostUsd: '16.000000',
    status: 'WARNING',
  },
};

describe('사용량·비용 운영 페이지', () => {
  it('현재 월 비용, threshold와 provider/model/voice breakdown을 표시한다', async () => {
    mocks.authenticatedRequest.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(path === '/admin/usage-cost/settings'
        ? {
            currency: 'USD',
            warningUsd: '15.000000',
            criticalUsd: '24.000000',
            updatedAt: '2026-07-01T00:00:00.000Z',
          }
        : overview),
    );

    renderWithProviders(
      <UsageCostOperationsPage
        onSearchChange={vi.fn()}
        search={{}}
      />,
    );

    expect(await screen.findByText('현재 월 예상 비용')).toBeInTheDocument();
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText('thai-female')).toBeInTheDocument();
    expect(screen.getAllByText('16.000000 USD')).not.toHaveLength(0);
  });

  it('settings 조회 실패가 overview breakdown을 비우지 않는다', async () => {
    mocks.authenticatedRequest.mockImplementation(({ path }: { path: string }) =>
      path === '/admin/usage-cost/settings'
        ? Promise.reject(new Error('settings failed'))
        : Promise.resolve(overview),
    );

    renderWithProviders(
      <UsageCostOperationsPage
        onSearchChange={vi.fn()}
        search={{}}
      />,
    );

    expect(await screen.findByText('현재 월 예상 비용')).toBeInTheDocument();
    expect(
      await screen.findByText('경고 기준을 불러오지 못했습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('thai-female')).toBeInTheDocument();
  });
});
