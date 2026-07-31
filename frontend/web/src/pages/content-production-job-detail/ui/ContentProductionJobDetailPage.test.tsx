/** 콘텐츠 제작 job 상세의 공개 상태와 retry 조건을 검증한다 */
import type { ContentProductionJobDetailResponse } from '@flex-thia/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { ContentProductionJobDetailPageContainer } from './ContentProductionJobDetailPageContainer';
import { ContentProductionJobDetailPageView } from './ContentProductionJobDetailPageView';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

const id = '00000000-0000-4000-8000-000000000001';
const job = {
  id,
  purpose: 'VOCABULARY_EXTRACTION',
  status: 'FAILED',
  attempt: 1,
  createdAt: '2026-07-28T00:00:00.000Z',
  completedAt: null,
  counts: {
    total: 1,
    succeeded: 0,
    needsAttention: 0,
    failed: 1,
  },
  presetSnapshot: {
    id,
    name: '어휘',
    version: 2,
    purpose: 'VOCABULARY_EXTRACTION',
    parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
  },
  inputs: [{ uploadId: id, inputType: 'TEXT', sizeBytes: 3 }],
  items: [
    {
      id,
      status: 'FAILED',
      attempt: 1,
      retryable: true,
      errorCode: 'PUBLIC_ERROR',
    },
  ],
} satisfies ContentProductionJobDetailResponse;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('콘텐츠 제작 작업 상세 화면', () => {
  it('공개 count·오류와 job 범위 후보 링크를 표시한다', () => {
    render(
      <ContentProductionJobDetailPageView
        job={job}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/PUBLIC_ERROR/u)).toBeVisible();
    expect(screen.getByText(/실패 1/u)).toBeVisible();
    expect(screen.getByRole('link', { name: '후보 검수' })).toHaveAttribute(
      'href',
      `/admin/content-production/candidates?jobId=${id}`,
    );
    expect(screen.getByRole('button', { name: '재시도' })).toBeEnabled();
  });

  it('재시도 가능한 항목이 없으면 재시도를 막는다', () => {
    const item = job.items[0];
    expect(item).toBeDefined();
    if (!item) return;
    render(
      <ContentProductionJobDetailPageView
        job={{ ...job, items: [{ ...item, retryable: false }] }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '재시도' })).toBeDisabled();
  });

  it('작업 재시도 중 버튼을 막고 성공 후 상세와 목록 query를 갱신한다', async () => {
    const user = userEvent.setup();
    const retriedJob = {
      ...job,
      status: 'QUEUED' as const,
      attempt: 2,
    };
    let getCount = 0;
    let completeRetry:
      ((value: ContentProductionJobDetailResponse) => void) | undefined;
    const pendingRetry = new Promise<ContentProductionJobDetailResponse>(
      (resolve) => {
        completeRetry = resolve;
      },
    );
    mocks.authenticatedRequest.mockImplementation(
      (request: { method?: string; path: string }) => {
        if (request.method === 'POST') return pendingRetry;
        getCount += 1;
        return Promise.resolve(getCount === 1 ? job : retriedJob);
      },
    );

    const { queryClient } = renderWithProviders(
      <ContentProductionJobDetailPageContainer jobId={id} />,
    );
    const listQueryKey = ['admin', 'content-production', 'jobs', 20] as const;
    queryClient.setQueryData(listQueryKey, { items: [] });

    await screen.findByText(/PUBLIC_ERROR/u);
    await user.click(screen.getByRole('button', { name: '재시도' }));

    expect(screen.getByRole('button', { name: '재시도' })).toBeDisabled();
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/admin/content-production/jobs/${id}/retry`,
      }),
    );

    expect(completeRetry).toBeDefined();
    completeRetry?.(retriedJob);

    expect(await screen.findByText('QUEUED')).toBeVisible();
    await waitFor(() => {
      expect(queryClient.getQueryState(listQueryKey)?.isInvalidated).toBe(true);
      expect(getCount).toBeGreaterThanOrEqual(2);
    });
  });

  it('조회 실패를 안내하고 다시 시도하면 상세 query를 복구한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(job);

    renderWithProviders(<ContentProductionJobDetailPageContainer jobId={id} />);

    expect(
      await screen.findByText('작업을 불러오지 못했습니다.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(
      await screen.findByRole('heading', { name: '콘텐츠 제작 작업' }),
    ).toBeVisible();
    expect(screen.getByText(/PUBLIC_ERROR/u)).toBeVisible();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
  });
});
