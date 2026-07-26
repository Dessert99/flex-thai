/** 단어 연습 세션 Container의 조회 상태와 답안·결과 이동 연결을 검증한다 */
import type {
  PracticeCard,
  VocabularyPracticeAnswerResponse,
  VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyPracticeSessionPageContainer } from './VocabularyPracticeSessionPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

const ids = {
  session: '00000000-0000-4000-8000-000000000701',
  vocabulary: '00000000-0000-4000-8000-000000000702',
  meaning: '00000000-0000-4000-8000-000000000703',
  question: '00000000-0000-4000-8000-000000000704',
  correctOption: '00000000-0000-4000-8000-000000000705',
  optionTwo: '00000000-0000-4000-8000-000000000706',
  optionThree: '00000000-0000-4000-8000-000000000707',
  optionFour: '00000000-0000-4000-8000-000000000708',
} as const;

const card = {
  id: ids.vocabulary,
  thai: 'ไป',
  kind: 'WORD',
  meanings: [
    {
      id: ids.meaning,
      meaningKo: '가다',
      partOfSpeech: '동사',
      difficulty: 1,
      contextNote: null,
    },
  ],
  pronunciations: [],
  meaningPronunciations: [],
} satisfies PracticeCard;

const session = {
  id: ids.session,
  sourceLabel: 'FLEX 어휘',
  modes: ['THAI_TO_MEANING'],
  questionCount: 1,
  order: 'SOURCE',
  startedAt: '2026-07-26T00:00:00.000Z',
  status: 'ACTIVE',
  completedAt: null,
  cards: [card],
  questions: [
    {
      id: ids.question,
      position: 1,
      vocabularyId: ids.vocabulary,
      meaningId: ids.meaning,
      mode: 'THAI_TO_MEANING',
      prompt: { type: 'TEXT', text: 'ไป' },
      options: [
        { id: ids.correctOption, label: '가다' },
        { id: ids.optionTwo, label: '먹다' },
        { id: ids.optionThree, label: '보다' },
        { id: ids.optionFour, label: '읽다' },
      ],
    },
  ],
  answeredQuestionIds: [],
} satisfies VocabularyPracticeSessionResponse;

const feedback = {
  questionId: ids.question,
  selectedOptionId: ids.correctOption,
  selectedLabel: '가다',
  isCorrect: true,
  correctOptionId: ids.correctOption,
  card,
  sessionCompleted: true,
  answeredAt: '2026-07-26T00:01:00.000Z',
} satisfies VocabularyPracticeAnswerResponse;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('단어 연습 세션 Container', () => {
  it('세션 요청이 끝나기 전 로딩 상태를 표시한다', () => {
    mocks.authenticatedRequest.mockReturnValue(new Promise(() => undefined));

    renderSession();

    expect(screen.getByRole('status')).toHaveTextContent(
      '단어 연습을 불러오고 있습니다.',
    );
  });

  it('세션 실패를 안내하고 사용자 재시도로 학습 화면을 복구한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(session);

    renderSession();

    expect(
      await screen.findByText('단어 연습을 불러오지 못했습니다.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(
      await screen.findByRole('heading', { name: '단어 익히기' }),
    ).toBeVisible();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
  });

  it('조회한 세션에 답안을 제출하고 완료 결과 이동을 연결한다', async () => {
    const user = userEvent.setup();
    const onShowResult = vi.fn();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000709',
    );
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        path.endsWith('/answers')
          ? Promise.resolve(feedback)
          : Promise.resolve(session),
    );
    renderSession(onShowResult);
    await screen.findByRole('heading', { name: '단어 익히기' });
    await user.click(screen.getByRole('button', { name: '기억 확인 시작' }));
    await user.click(screen.getByLabelText('가다'));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));
    await user.click(await screen.findByRole('button', { name: '결과 보기' }));

    expect(mocks.authenticatedRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/me/vocabulary-practice/sessions/${ids.session}/questions/${ids.question}/answers`,
        body: {
          clientAnswerId: '00000000-0000-4000-8000-000000000709',
          selectedOptionId: ids.correctOption,
        },
      }),
    );
    expect(onShowResult).toHaveBeenCalledWith(ids.session);
  });
});

function renderSession(onShowResult = vi.fn()) {
  return renderWithProviders(
    <VocabularyPracticeSessionPageContainer
      onShowResult={onShowResult}
      sessionId={ids.session}
    />,
  );
}
