/** TTS audio가 클릭 전 요청되지 않고 click-time URL을 사용하는지 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { PlayTtsAudioButton } from './PlayTtsAudioButton';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

describe('TTS 음성 재생', () => {
  beforeEach(() => {
    mocks.authenticatedRequest.mockReset();
  });

  it('클릭할 때만 새 URL을 발급해 audio controls를 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      url: 'http://127.0.0.1/audio',
      expiresAt: '2026-07-28T00:05:00.000Z',
    });
    renderWithProviders(
      <PlayTtsAudioButton itemId='00000000-0000-4000-8000-000000000001' />,
    );
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '음성 재생' }));
    expect(await screen.findByLabelText('TTS 음성')).toHaveAttribute(
      'src',
      'http://127.0.0.1/audio',
    );
  });

  it('두 번째 클릭은 만료 가능한 기존 URL을 재사용하지 않고 새 URL을 발급한다', async () => {
    mocks.authenticatedRequest
      .mockResolvedValueOnce({
        url: 'http://127.0.0.1/audio/first',
        expiresAt: '2026-07-28T00:05:00.000Z',
      })
      .mockResolvedValueOnce({
        url: 'http://127.0.0.1/audio/second',
        expiresAt: '2026-07-28T00:10:00.000Z',
      });
    const user = userEvent.setup();
    renderWithProviders(
      <PlayTtsAudioButton itemId='00000000-0000-4000-8000-000000000001' />,
    );

    await user.click(screen.getByRole('button', { name: '음성 재생' }));
    expect(await screen.findByLabelText('TTS 음성')).toHaveAttribute(
      'src',
      'http://127.0.0.1/audio/first',
    );
    await user.click(screen.getByRole('button', { name: '음성 재생' }));

    expect(await screen.findByLabelText('TTS 음성')).toHaveAttribute(
      'src',
      'http://127.0.0.1/audio/second',
    );
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
  });

  it('409이면 준비되지 않은 음성 안내를 표시하고 audio를 만들지 않는다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(
      new ApiError({
        kind: 'problem',
        problem: {
          code: 'TTS_AUDIO_NOT_READY',
          fieldErrors: [],
          requestId: 'request-id',
          status: 409,
          title: 'Conflict',
          type: 'about:blank',
        },
      }),
    );
    renderWithProviders(
      <PlayTtsAudioButton itemId='00000000-0000-4000-8000-000000000001' />,
    );

    await userEvent.click(screen.getByRole('button', { name: '음성 재생' }));

    expect(
      await screen.findByText('아직 재생할 수 없는 음성입니다'),
    ).toBeVisible();
    expect(screen.queryByLabelText('TTS 음성')).not.toBeInTheDocument();
  });
});
