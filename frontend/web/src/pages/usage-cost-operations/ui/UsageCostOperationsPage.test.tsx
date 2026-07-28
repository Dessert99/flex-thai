/** 사용량·비용 overview와 독립 settings 상태의 사용자 표시를 검증한다 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
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

// eslint-disable-next-line max-lines-per-function -- 같은 page fixture에서 운영자 동작별 회귀를 검증한다.
describe('사용량·비용 운영 페이지', () => {
  it('현재 월 비용, threshold와 provider/model/voice breakdown을 표시한다', async () => {
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        Promise.resolve(
          path === '/admin/usage-cost/settings'
            ? {
                currency: 'USD',
                warningUsd: '15.000000',
                criticalUsd: '24.000000',
                updatedAt: '2026-07-01T00:00:00.000Z',
              }
            : overview,
        ),
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
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
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

  it('기간 filter는 시작과 종료를 모두 입력한 뒤 한 번에 적용한다', async () => {
    const onSearchChange = vi.fn();
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        Promise.resolve(
          path === '/admin/usage-cost/settings'
            ? {
                currency: 'USD',
                warningUsd: '15.000000',
                criticalUsd: '24.000000',
                updatedAt: '2026-07-01T00:00:00.000Z',
              }
            : overview,
        ),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <UsageCostOperationsPage
        onSearchChange={onSearchChange}
        search={{}}
      />,
    );
    await screen.findByText('현재 월 예상 비용');

    await user.type(screen.getByLabelText('시작 시각'), '2026-07-01T09:00');
    expect(onSearchChange).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('종료 시각'), '2026-08-01T09:00');
    await user.click(screen.getByRole('button', { name: '조회 조건 적용' }));

    expect(onSearchChange).toHaveBeenCalledWith({
      from: new Date('2026-07-01T09:00').toISOString(),
      to: new Date('2026-08-01T09:00').toISOString(),
    });
  });

  it('실행 상태 filter를 URL 상태에 반영한다', async () => {
    const onSearchChange = vi.fn();
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        Promise.resolve(
          path === '/admin/usage-cost/settings'
            ? {
                currency: 'USD',
                warningUsd: '15.000000',
                criticalUsd: '24.000000',
                updatedAt: '2026-07-01T00:00:00.000Z',
              }
            : overview,
        ),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <UsageCostOperationsPage
        onSearchChange={onSearchChange}
        search={{}}
      />,
    );
    await screen.findByText('현재 월 예상 비용');
    await user.click(screen.getByRole('button', { name: '실패' }));

    expect(onSearchChange).toHaveBeenCalledWith({ status: 'FAILED' });
  });

  it('settings 충돌은 최신 값을 다시 읽고 별도 안내를 표시한다', async () => {
    let settingsRequestCount = 0;
    mocks.authenticatedRequest.mockImplementation(
      ({ method, path }: { method?: string; path: string }) => {
        if (method === 'PUT') {
          return Promise.reject(
            new ApiError({
              kind: 'problem',
              problem: {
                code: 'OPERATIONS_COST_SETTINGS_CONFLICT',
                fieldErrors: [],
                requestId: 'request-id',
                status: 409,
                title: 'Conflict',
                type: 'about:blank',
              },
            }),
          );
        }
        if (path === '/admin/usage-cost/settings') {
          settingsRequestCount += 1;
          return Promise.resolve({
            currency: 'USD',
            warningUsd: '15.000000',
            criticalUsd: '24.000000',
            updatedAt: '2026-07-01T00:00:00.000Z',
          });
        }
        return Promise.resolve(overview);
      },
    );
    const user = userEvent.setup();

    renderWithProviders(
      <UsageCostOperationsPage
        onSearchChange={vi.fn()}
        search={{}}
      />,
    );
    await screen.findByDisplayValue('15.000000');
    await user.click(screen.getByRole('button', { name: '경고 기준 저장' }));

    expect(
      await screen.findByText(
        '다른 관리자가 기준을 변경했습니다. 최신 값을 확인하세요.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(settingsRequestCount).toBeGreaterThanOrEqual(2));
    expect(screen.getByDisplayValue('15.000000')).toBeInTheDocument();
  });
});
