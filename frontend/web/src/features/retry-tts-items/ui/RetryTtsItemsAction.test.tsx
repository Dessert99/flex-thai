/** TTS retry selection 자격과 durable command 전송을 검증한다 */
import { screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { createTestQueryClient, renderWithProviders } from '@/shared/test';
import { RetryTtsItemsAction } from './RetryTtsItemsAction';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

// eslint-disable-next-line max-lines-per-function -- 선택 수와 stale attempt 회귀를 같은 feature fixture로 검증한다.
describe('TTS 항목 재시도', () => {
  beforeEach(() => {
    mocks.authenticatedRequest.mockReset();
  });

  it('FAILED이며 retryable인 항목만 현재 attempt로 재시도한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      jobId: '00000000-0000-4000-8000-000000000001',
      itemIds: ['00000000-0000-4000-8000-000000000002'],
      retriedCount: 1,
    });
    renderWithProviders(
      <RetryTtsItemsAction
        items={[
          {
            id: '00000000-0000-4000-8000-000000000002',
            status: 'FAILED',
            attempt: 2,
            retryable: true,
          },
        ]}
        jobId='00000000-0000-4000-8000-000000000001'
      />,
    );
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: '선택 재시도' }));
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          items: [
            {
              itemId: '00000000-0000-4000-8000-000000000002',
              expectedAttempt: 2,
            },
          ],
        },
      }),
    );
  });

  it('여러 FAILED·retryable 항목을 각 attempt와 함께 일괄 재시도한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      jobId: '00000000-0000-4000-8000-000000000001',
      itemIds: [
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      ],
      retriedCount: 2,
    });
    renderWithProviders(
      <RetryTtsItemsAction
        items={[
          {
            id: '00000000-0000-4000-8000-000000000002',
            status: 'FAILED',
            attempt: 2,
            retryable: true,
          },
          {
            id: '00000000-0000-4000-8000-000000000003',
            status: 'FAILED',
            attempt: 5,
            retryable: true,
          },
        ]}
        jobId='00000000-0000-4000-8000-000000000001'
      />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: '00000000-0000-4000-8000-000000000002',
      }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: '00000000-0000-4000-8000-000000000003',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: '선택 재시도' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          items: [
            {
              itemId: '00000000-0000-4000-8000-000000000002',
              expectedAttempt: 2,
            },
            {
              itemId: '00000000-0000-4000-8000-000000000003',
              expectedAttempt: 5,
            },
          ],
        },
      }),
    );
  });

  it('stale attempt 409이면 상세을 다시 읽고 이전 attempt 선택을 사용하지 않는다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(
      new ApiError({
        kind: 'problem',
        problem: {
          code: 'TTS_ITEM_STALE_ATTEMPT',
          fieldErrors: [],
          requestId: 'request-id',
          status: 409,
          title: 'Conflict',
          type: 'about:blank',
        },
      }),
    );
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const item = {
      id: '00000000-0000-4000-8000-000000000002',
      status: 'FAILED',
      attempt: 2,
      retryable: true,
    };
    const { rerender } = renderWithProviders(
      <RetryTtsItemsAction
        items={[item]}
        jobId='00000000-0000-4000-8000-000000000001'
      />,
      { queryClient },
    );
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: '선택 재시도' }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [
          'admin',
          'tts',
          'jobs',
          'detail',
          '00000000-0000-4000-8000-000000000001',
        ],
      }),
    );
    rerender(
      <RetryTtsItemsAction
        items={[{ ...item, attempt: 3 }]}
        jobId='00000000-0000-4000-8000-000000000001'
      />,
    );

    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('button', { name: '선택 재시도' })).toBeDisabled();
  });

  it('stale attempt 409이면 readiness를 다시 읽어 최신 attempt를 표시한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(
      new ApiError({
        kind: 'problem',
        problem: {
          code: 'TTS_ITEM_STALE_ATTEMPT',
          fieldErrors: [],
          requestId: 'request-id',
          status: 409,
          title: 'Conflict',
          type: 'about:blank',
        },
      }),
    );
    let readinessRequestCount = 0;
    const readinessQuery = () => {
      readinessRequestCount += 1;
      return Promise.resolve({
        attempt: readinessRequestCount === 1 ? 2 : 3,
      });
    };

    function RetryWithReadiness() {
      const readiness = useQuery({
        queryKey: [
          'admin',
          'tts',
          'readiness',
          '00000000-0000-4000-8000-000000000010',
          '00000000-0000-4000-8000-000000000011',
        ],
        queryFn: readinessQuery,
      });
      return (
        <>
          <p>readiness attempt {readiness.data?.attempt}</p>
          <RetryTtsItemsAction
            items={[
              {
                id: '00000000-0000-4000-8000-000000000002',
                status: 'FAILED',
                attempt: 2,
                retryable: true,
              },
            ]}
            jobId='00000000-0000-4000-8000-000000000001'
          />
        </>
      );
    }

    renderWithProviders(<RetryWithReadiness />);
    expect(await screen.findByText('readiness attempt 2')).toBeVisible();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: '선택 재시도' }));

    expect(await screen.findByText('readiness attempt 3')).toBeVisible();
  });
});
