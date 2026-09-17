/** 원시 풀이 기록과 원본 ISO datetime 보존을 검증한다 */
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { LearningHistoryPage as LearningHistoryPageContainer } from './LearningHistoryPage';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/shared/apis/auth/authenticatedRequest')
    >();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockResolvedValue({
    items: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57ad1',
        questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        questionVersion: 1,
        questionSnapshot: {
          updatedAt: '2026-07-25T00:00:00.000Z',
          version: 1,
          typeVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
          difficulty: 1,
          passage: null,
          prompt: 'คำถาม',
          options: [],
          correctOptionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
          explanation: '해설',
        },
        attemptNo: 1,
        selectedOptionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
        clientAttemptId: '01933b6a-8f13-7a19-b7e5-536d70f57ac1',
        durationMs: 1500,
        isCorrect: true,
        submittedAt: '2026-07-25T00:00:00.000Z',
      },
    ],
    page: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    },
  });
});

describe('학습 기록 페이지', () => {
  it('실제 시도 번호와 정오답, 원본 UTC 시간을 표시한다', async () => {
    renderWithProviders(<LearningHistoryPageContainer />);

    expect(
      await screen.findByRole('link', { name: '1번째 시도 · 문제 버전 1' }),
    ).toBeInTheDocument();
    expect(screen.getByText('정답')).toBeInTheDocument();
    expect(screen.getByRole('time')).toHaveAttribute(
      'datetime',
      '2026-07-25T00:00:00.000Z',
    );
    expect(screen.queryByText(/정답률|점수/u)).not.toBeInTheDocument();
  });
});
