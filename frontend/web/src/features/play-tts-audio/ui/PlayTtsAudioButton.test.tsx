/** TTS audio가 클릭 전 요청되지 않고 click-time URL을 사용하는지 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { PlayTtsAudioButton } from './PlayTtsAudioButton';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

describe('TTS 음성 재생', () => {
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
    expect(await screen.findByRole('audio')).toHaveAttribute(
      'src',
      'http://127.0.0.1/audio',
    );
  });
});
