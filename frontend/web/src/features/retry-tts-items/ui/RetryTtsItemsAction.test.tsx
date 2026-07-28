/** TTS retry selection 자격과 durable command 전송을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { RetryTtsItemsAction } from './RetryTtsItemsAction';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

describe('TTS 항목 재시도', () => {
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
});
