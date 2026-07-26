/** 단어 연습 답안의 멱등 재시도와 feedback 전 정답 비공개를 검증한다 */
import type {
  PracticeQuestion,
  VocabularyPracticeAnswerResponse,
} from '@flex-thia/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyPracticeAnswerForm } from './VocabularyPracticeAnswerForm';

const correctOptionId = '00000000-0000-4000-8000-000000000204';

const question = {
  id: '00000000-0000-4000-8000-000000000201',
  position: 1,
  vocabularyId: '00000000-0000-4000-8000-000000000202',
  meaningId: '00000000-0000-4000-8000-000000000203',
  mode: 'THAI_TO_MEANING',
  prompt: { type: 'TEXT', text: 'ไป' },
  options: [
    {
      id: correctOptionId,
      label: '가다',
    },
    {
      id: '00000000-0000-4000-8000-000000000205',
      label: '먹다',
    },
    {
      id: '00000000-0000-4000-8000-000000000206',
      label: '보다',
    },
    {
      id: '00000000-0000-4000-8000-000000000207',
      label: '읽다',
    },
  ],
} satisfies PracticeQuestion;

const feedback = {
  questionId: question.id,
  selectedOptionId: correctOptionId,
  selectedLabel: '가다',
  isCorrect: true,
  correctOptionId,
  card: {
    id: question.vocabularyId,
    thai: 'ไป',
    kind: 'WORD',
    meanings: [
      {
        id: question.meaningId,
        meaningKo: '가다',
        partOfSpeech: '동사',
        difficulty: 1,
        contextNote: null,
      },
    ],
    pronunciations: [
      {
        id: '00000000-0000-4000-8000-000000000208',
        pronunciationKo: '빠이',
        toneMarks: '평성',
        audioUrl: 'https://example.com/pai.mp3',
      },
    ],
    meaningPronunciations: [
      {
        meaningId: question.meaningId,
        pronunciationId: '00000000-0000-4000-8000-000000000208',
      },
    ],
  },
  sessionCompleted: false,
  answeredAt: '2026-07-26T00:01:00.000Z',
} satisfies VocabularyPracticeAnswerResponse;

describe('단어 연습 답안 form', () => {
  it('실패 재시도에 같은 clientAnswerId를 사용하고 성공 뒤 정답을 공개한다', async () => {
    const user = userEvent.setup();
    const clientAnswerId = '00000000-0000-4000-8000-000000000209';
    const randomUUID = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue(clientAnswerId);
    const onAnswer = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(feedback);
    renderWithProviders(
      <VocabularyPracticeAnswerForm
        onAnswer={onAnswer}
        question={question}
      />,
    );

    expect(screen.queryByText(/^정답:/u)).toBeNull();
    await user.click(screen.getByLabelText('가다'));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: '같은 답안 다시 제출' }),
    );

    expect(await screen.findByText('정답입니다.')).toBeVisible();
    expect(onAnswer).toHaveBeenNthCalledWith(1, {
      clientAnswerId,
      selectedOptionId: correctOptionId,
    });
    expect(onAnswer).toHaveBeenNthCalledWith(2, {
      clientAnswerId,
      selectedOptionId: correctOptionId,
    });
    expect(randomUUID).toHaveBeenCalledOnce();
  });
});
