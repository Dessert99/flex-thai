/** 완료된 단어 연습의 서버 집계와 오답 카드 표시 범위를 검증한다 */
import type { VocabularyPracticeSessionResponse } from '@flex-thia/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyPracticeResultPageView } from './VocabularyPracticeResultPageView';

const completedSession = {
  id: '00000000-0000-4000-8000-000000000101',
  sourceLabel: 'FLEX 어휘',
  modes: ['THAI_TO_MEANING'],
  questionCount: 1,
  order: 'SOURCE',
  startedAt: '2026-07-26T00:00:00.000Z',
  status: 'COMPLETED',
  completedAt: '2026-07-26T00:01:00.000Z',
  cards: [
    {
      id: '00000000-0000-4000-8000-000000000102',
      thai: 'ไป',
      kind: 'WORD',
      meanings: [
        {
          id: '00000000-0000-4000-8000-000000000103',
          meaningKo: '가다',
          partOfSpeech: '동사',
          difficulty: 1,
          contextNote: null,
        },
      ],
      pronunciations: [
        {
          id: '00000000-0000-4000-8000-000000000104',
          pronunciationKo: '빠이',
          toneMarks: '평성',
          audioUrl: 'https://example.com/pai.mp3',
        },
      ],
      meaningPronunciations: [
        {
          meaningId: '00000000-0000-4000-8000-000000000103',
          pronunciationId: '00000000-0000-4000-8000-000000000104',
        },
      ],
    },
  ],
  questions: [
    {
      id: '00000000-0000-4000-8000-000000000105',
      position: 1,
      vocabularyId: '00000000-0000-4000-8000-000000000102',
      meaningId: '00000000-0000-4000-8000-000000000103',
      mode: 'THAI_TO_MEANING',
      prompt: { type: 'TEXT', text: 'ไป' },
      options: [
        {
          id: '00000000-0000-4000-8000-000000000106',
          label: '가다',
        },
        {
          id: '00000000-0000-4000-8000-000000000107',
          label: '먹다',
        },
        {
          id: '00000000-0000-4000-8000-000000000108',
          label: '보다',
        },
        {
          id: '00000000-0000-4000-8000-000000000109',
          label: '읽다',
        },
      ],
    },
  ],
  answeredQuestionIds: ['00000000-0000-4000-8000-000000000105'],
  result: {
    total: { correct: 0, incorrect: 1 },
    byMode: [{ mode: 'THAI_TO_MEANING', correct: 0, incorrect: 1 }],
    incorrectCards: [],
  },
} satisfies VocabularyPracticeSessionResponse;

describe('단어 연습 결과 화면', () => {
  it('전체·방식별 집계를 표시하고 추정 지표는 만들지 않는다', () => {
    renderWithProviders(
      <VocabularyPracticeResultPageView
        onContinue={vi.fn()}
        session={completedSession}
      />,
    );

    expect(screen.getByText('정답 0개')).toBeVisible();
    expect(screen.getByText('오답 1개')).toBeVisible();
    expect(screen.getByText(/태국어 → 뜻/u)).toBeVisible();
    expect(
      screen.queryByText(/숙련도|연속 기록|백분위/u),
    ).not.toBeInTheDocument();
  });

  it('진행 중 세션이면 연습 복귀 경계를 제공한다', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const { result: _result, ...sessionWithoutResult } = completedSession;
    expect(_result).toBeDefined();
    renderWithProviders(
      <VocabularyPracticeResultPageView
        onContinue={onContinue}
        session={{
          ...sessionWithoutResult,
          status: 'ACTIVE',
          completedAt: null,
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '연습으로 돌아가기' }));
    expect(onContinue).toHaveBeenCalledWith(completedSession.id);
  });
});
