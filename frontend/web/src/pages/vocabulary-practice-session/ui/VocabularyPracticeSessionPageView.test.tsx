/** 단어 연습 학습 카드·이어 풀기·즉시 피드백 동작을 검증한다 */
import type {
  PracticeCard,
  PracticeQuestion,
  VocabularyPracticeAnswerResponse,
  VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyPracticeSessionPageView } from './VocabularyPracticeSessionPageView';

const ids = {
  session: '00000000-0000-4000-8000-000000000001',
  vocabularyOne: '00000000-0000-4000-8000-000000000002',
  vocabularyTwo: '00000000-0000-4000-8000-000000000003',
  meaningOne: '00000000-0000-4000-8000-000000000004',
  meaningTwo: '00000000-0000-4000-8000-000000000005',
  pronunciationOne: '00000000-0000-4000-8000-000000000006',
  pronunciationTwo: '00000000-0000-4000-8000-000000000007',
  questionOne: '00000000-0000-4000-8000-000000000008',
  questionTwo: '00000000-0000-4000-8000-000000000009',
  optionOne: '00000000-0000-4000-8000-000000000010',
  optionTwo: '00000000-0000-4000-8000-000000000011',
  optionThree: '00000000-0000-4000-8000-000000000012',
  optionFour: '00000000-0000-4000-8000-000000000013',
};

const cards: [PracticeCard, PracticeCard] = [
  {
    id: ids.vocabularyOne,
    thai: 'กิน',
    kind: 'WORD' as const,
    meanings: [
      {
        id: ids.meaningOne,
        meaningKo: '먹다',
        partOfSpeech: '동사',
        difficulty: 1,
        contextNote: null,
      },
    ],
    pronunciations: [
      {
        id: ids.pronunciationOne,
        pronunciationKo: '낀',
        toneMarks: '평성',
        audioUrl: 'https://example.com/kin.mp3',
      },
    ],
    meaningPronunciations: [
      {
        meaningId: ids.meaningOne,
        pronunciationId: ids.pronunciationOne,
      },
    ],
  },
  {
    id: ids.vocabularyTwo,
    thai: 'ไป',
    kind: 'WORD' as const,
    meanings: [
      {
        id: ids.meaningTwo,
        meaningKo: '가다',
        partOfSpeech: '동사',
        difficulty: 1,
        contextNote: '이동',
      },
    ],
    pronunciations: [
      {
        id: ids.pronunciationTwo,
        pronunciationKo: '빠이',
        toneMarks: '평성',
        audioUrl: 'https://example.com/pai.mp3',
      },
    ],
    meaningPronunciations: [
      {
        meaningId: ids.meaningTwo,
        pronunciationId: ids.pronunciationTwo,
      },
    ],
  },
];

const options = [
  { id: ids.optionOne, label: '먹다' },
  { id: ids.optionTwo, label: '가다' },
  { id: ids.optionThree, label: '보다' },
  { id: ids.optionFour, label: '읽다' },
];

const questions: [PracticeQuestion, PracticeQuestion] = [
  {
    id: ids.questionOne,
    position: 1,
    vocabularyId: ids.vocabularyOne,
    meaningId: ids.meaningOne,
    mode: 'THAI_TO_MEANING',
    prompt: { type: 'TEXT', text: 'กิน' },
    options,
  },
  {
    id: ids.questionTwo,
    position: 2,
    vocabularyId: ids.vocabularyTwo,
    meaningId: ids.meaningTwo,
    mode: 'THAI_TO_MEANING',
    prompt: { type: 'TEXT', text: 'ไป' },
    options,
  },
];

const session = {
  id: ids.session,
  sourceLabel: 'FLEX 어휘',
  modes: ['THAI_TO_MEANING'],
  questionCount: 2,
  order: 'SOURCE',
  startedAt: '2026-07-26T00:00:00.000Z',
  status: 'ACTIVE',
  completedAt: null,
  cards,
  questions,
  answeredQuestionIds: [ids.questionOne],
} satisfies VocabularyPracticeSessionResponse;

describe('단어 연습 세션 화면', () => {
  it('전체 학습 카드를 보여주고 기억 확인은 첫 미응답 문항부터 시작한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VocabularyPracticeSessionPageView
        onAnswer={vi.fn()}
        onShowResult={vi.fn()}
        session={session}
      />,
    );

    expect(screen.getByText('먹다', { selector: 'span' })).toBeVisible();
    expect(screen.queryByText('빠이', { selector: 'span' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '기억 확인 시작' }));

    expect(screen.getByText('2 / 2')).toBeVisible();
    expect(screen.getByText('ไป')).toBeVisible();
  });

  it('제출 뒤 선택을 잠그고 정답과 전체 카드를 공개한다', async () => {
    const user = userEvent.setup();
    const feedback: VocabularyPracticeAnswerResponse = {
      questionId: ids.questionTwo,
      selectedOptionId: ids.optionOne,
      selectedLabel: '먹다',
      isCorrect: false,
      correctOptionId: ids.optionTwo,
      card: cards[1],
      sessionCompleted: true,
      answeredAt: '2026-07-26T00:01:00.000Z',
    };
    const onAnswer = vi.fn().mockResolvedValue(feedback);
    renderWithProviders(
      <VocabularyPracticeSessionPageView
        onAnswer={onAnswer}
        onShowResult={vi.fn()}
        session={session}
      />,
    );
    await user.click(screen.getByRole('button', { name: '기억 확인 시작' }));
    await user.click(screen.getByLabelText('먹다'));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));

    expect(await screen.findByText('정답을 확인해 주세요.')).toBeVisible();
    expect(screen.getByLabelText('먹다')).toBeDisabled();
    expect(screen.getByText('정답: 가다')).toBeVisible();
    expect(screen.getByText('빠이', { selector: 'span' })).toBeVisible();
  });

  it('마지막 답 제출 뒤 결과 이동을 우선 제공한다', async () => {
    const user = userEvent.setup();
    const onShowResult = vi.fn();
    renderWithProviders(
      <VocabularyPracticeSessionPageView
        onAnswer={vi.fn().mockResolvedValue({
          questionId: ids.questionTwo,
          selectedOptionId: ids.optionTwo,
          selectedLabel: '가다',
          isCorrect: true,
          correctOptionId: ids.optionTwo,
          card: cards[1],
          sessionCompleted: true,
          answeredAt: '2026-07-26T00:01:00.000Z',
        })}
        onShowResult={onShowResult}
        session={session}
      />,
    );
    await user.click(screen.getByRole('button', { name: '기억 확인 시작' }));
    await user.click(screen.getByLabelText('가다'));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));
    await user.click(await screen.findByRole('button', { name: '결과 보기' }));

    expect(onShowResult).toHaveBeenCalledWith(ids.session);
    expect(screen.queryByRole('button', { name: '다음 문항' })).toBeNull();
  });
});

describe('단어 연습 세션의 이어 풀기', () => {
  it('이미 완료된 세션을 열면 결과 이동을 제공한다', async () => {
    const user = userEvent.setup();
    const onShowResult = vi.fn();
    renderWithProviders(
      <VocabularyPracticeSessionPageView
        onAnswer={vi.fn()}
        onShowResult={onShowResult}
        session={{
          ...session,
          status: 'COMPLETED',
          completedAt: '2026-07-26T00:01:00.000Z',
          answeredQuestionIds: [ids.questionOne, ids.questionTwo],
          result: {
            total: { correct: 2, incorrect: 0 },
            byMode: [
              {
                mode: 'THAI_TO_MEANING',
                correct: 2,
                incorrect: 0,
              },
            ],
            incorrectCards: [],
          },
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '결과 보기' }));
    expect(onShowResult).toHaveBeenCalledWith(ids.session);
  });

  it('다음 문항은 이미 답한 문항을 건너뛴다', async () => {
    const user = userEvent.setup();
    const thirdQuestion = {
      ...questions[1],
      id: '00000000-0000-4000-8000-000000000014',
      position: 3,
      prompt: { type: 'TEXT' as const, text: 'เขียน' },
    };
    renderWithProviders(
      <VocabularyPracticeSessionPageView
        onAnswer={vi.fn().mockResolvedValue({
          questionId: ids.questionOne,
          selectedOptionId: ids.optionOne,
          selectedLabel: '먹다',
          isCorrect: true,
          correctOptionId: ids.optionOne,
          card: cards[0],
          sessionCompleted: false,
          answeredAt: '2026-07-26T00:01:00.000Z',
        })}
        onShowResult={vi.fn()}
        session={{
          ...session,
          questionCount: 3,
          questions: [questions[0], questions[1], thirdQuestion],
          answeredQuestionIds: [ids.questionTwo],
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: '기억 확인 시작' }));
    await user.click(screen.getByLabelText('먹다'));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));
    await user.click(await screen.findByRole('button', { name: '다음 문항' }));

    expect(screen.getByText('3 / 3')).toBeVisible();
    expect(screen.getByText('เขียน')).toBeVisible();
  });

  it('refetch로 현재 문항이 답변 처리되면 다음 미응답 문항에 맞춘다', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const onShowResult = vi.fn();
    const { rerender } = renderWithProviders(
      <VocabularyPracticeSessionPageView
        onAnswer={onAnswer}
        onShowResult={onShowResult}
        session={{ ...session, answeredQuestionIds: [] }}
      />,
    );
    await user.click(screen.getByRole('button', { name: '기억 확인 시작' }));
    expect(screen.getByText('1 / 2')).toBeVisible();

    rerender(
      <VocabularyPracticeSessionPageView
        onAnswer={onAnswer}
        onShowResult={onShowResult}
        session={{ ...session, answeredQuestionIds: [ids.questionOne] }}
      />,
    );

    expect(await screen.findByText('2 / 2')).toBeVisible();
    expect(screen.getByText('ไป')).toBeVisible();
  });
});
