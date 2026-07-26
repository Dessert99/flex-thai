/** 단어 연습 결과 Container의 조회 상태와 연습 복귀 연결을 검증한다 */
import type { VocabularyPracticeSessionResponse } from '@flex-thia/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyPracticeResultPageContainer } from './VocabularyPracticeResultPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

const completedSession = {
  id: '00000000-0000-4000-8000-000000000801',
  sourceLabel: 'FLEX 어휘',
  modes: ['THAI_TO_MEANING'],
  questionCount: 1,
  order: 'SOURCE',
  startedAt: '2026-07-26T00:00:00.000Z',
  status: 'COMPLETED',
  completedAt: '2026-07-26T00:01:00.000Z',
  cards: [],
  questions: [],
  answeredQuestionIds: [],
  result: {
    total: { correct: 1, incorrect: 0 },
    byMode: [{ mode: 'THAI_TO_MEANING', correct: 1, incorrect: 0 }],
    incorrectCards: [],
  },
} satisfies VocabularyPracticeSessionResponse;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('단어 연습 결과 Container', () => {
  it('결과 요청이 끝나기 전 로딩 상태를 표시한다', () => {
    mocks.authenticatedRequest.mockReturnValue(new Promise(() => undefined));

    renderResult();

    expect(screen.getByRole('status')).toHaveTextContent(
      '연습 결과를 불러오고 있습니다.',
    );
  });

  it('결과 실패를 안내하고 사용자 재시도로 결과 화면을 복구한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(completedSession);

    renderResult();

    expect(
      await screen.findByText('연습 결과를 불러오지 못했습니다.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(
      await screen.findByRole('heading', { name: '단어 연습 결과' }),
    ).toBeVisible();
    expect(screen.getByText('정답 1개')).toBeVisible();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
  });

  it('진행 중 세션이면 사용자 조작 없이 진행 화면 이동을 요청한다', async () => {
    const onContinue = vi.fn();
    const { result: _result, ...sessionWithoutResult } = completedSession;
    expect(_result).toBeDefined();
    mocks.authenticatedRequest.mockResolvedValue({
      ...sessionWithoutResult,
      status: 'ACTIVE',
      completedAt: null,
    });

    renderResult(onContinue);
    await waitFor(() =>
      expect(onContinue).toHaveBeenCalledWith(completedSession.id),
    );
    expect(
      screen.queryByRole('button', { name: '연습으로 돌아가기' }),
    ).not.toBeInTheDocument();
  });
});

function renderResult(onContinue = vi.fn()) {
  return renderWithProviders(
    <VocabularyPracticeResultPageContainer
      onContinue={onContinue}
      sessionId={completedSession.id}
    />,
  );
}
