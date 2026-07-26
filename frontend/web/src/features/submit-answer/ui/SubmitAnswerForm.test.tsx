/** 답안 제출의 멱등 ID·피드백·다시 풀기 수명주기를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import type { SubmitAnswerCommand } from '../api/submitAnswerMutation';
import { SubmitAnswerForm } from './SubmitAnswerForm';

const mocks = vi.hoisted(() => ({
  createClientAttemptId: vi.fn(),
  submitAnswer: vi.fn(),
}));

vi.mock('../model/createClientAttemptId', () => ({
  createClientAttemptId: mocks.createClientAttemptId,
}));
vi.mock('../api/submitAnswerMutation', () => ({
  submitAnswer: mocks.submitAnswer,
}));

const options = [
  {
    id: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
    label: 'ตัวเลือกหนึ่ง',
    span: null,
  },
  {
    id: '01933b6a-8f13-7a19-b7e5-536d70f57ab2',
    label: 'ตัวเลือกสอง',
    span: null,
  },
];

const inlineSentence = {
  sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aff',
  originalText: 'ฉันรักเธอ',
  translationKo: '나는 너를 사랑한다',
  pronunciationKo: '찬 락 터',
  toneMarks: 'R H M',
  audioUrl: null,
  tokens: [
    {
      position: 0,
      surface: 'ฉัน',
      startOffset: 0,
      endOffset: 3,
      vocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57a01',
      meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57a02',
      pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57a03',
      contextMeaningKo: '나',
      pronunciationKo: '찬',
      toneMarks: 'R',
      audioUrl: null,
      role: 'TARGET' as const,
    },
    {
      position: 1,
      surface: 'รัก',
      startOffset: 3,
      endOffset: 6,
      vocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57a04',
      meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57a05',
      pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57a06',
      contextMeaningKo: '사랑하다',
      pronunciationKo: '락',
      toneMarks: 'H',
      audioUrl: null,
      role: 'TARGET' as const,
    },
    {
      position: 2,
      surface: 'เธอ',
      startOffset: 6,
      endOffset: 9,
      vocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57a07',
      meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57a08',
      pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57a09',
      contextMeaningKo: '너',
      pronunciationKo: '터',
      toneMarks: 'M',
      audioUrl: null,
      role: 'TARGET' as const,
    },
  ],
  expressions: [],
};

beforeEach(() => {
  mocks.createClientAttemptId
    .mockReset()
    .mockReturnValueOnce('01933b6a-8f13-7a19-b7e5-536d70f57ac1')
    .mockReturnValueOnce('01933b6a-8f13-7a19-b7e5-536d70f57ac2');
  mocks.submitAnswer.mockReset();
});

describe('답안 제출 폼', () => {
  it('실패 재시도에는 같은 ID를 쓰고 다시 풀기에는 새 ID를 쓴다', async () => {
    mocks.submitAnswer
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(createFeedback(false))
      .mockResolvedValueOnce(createFeedback(true));
    const user = userEvent.setup();
    renderWithProviders(
      <SubmitAnswerForm
        options={options}
        questionId='01933b6a-8f13-7a19-b7e5-536d70f57aaa'
        questionVersionId='01933b6a-8f13-7a19-b7e5-536d70f57aab'
      />,
    );

    await user.click(screen.getByLabelText('ตัวเลือกหนึ่ง'));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));
    await user.click(
      await screen.findByRole('button', { name: '같은 답안 다시 제출' }),
    );

    expect(submittedCommand(0).clientAttemptId).toBe(
      submittedCommand(1).clientAttemptId,
    );
    expect(await screen.findByText('오답입니다.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 풀기' }));
    await user.click(screen.getByLabelText('ตัวเลือกสอง'));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));

    expect(submittedCommand(2).clientAttemptId).not.toBe(
      submittedCommand(1).clientAttemptId,
    );
    expect(await screen.findByText('정답입니다.')).toBeInTheDocument();
  });
});

describe('답안 선택 상호작용', () => {
  it('inline 범위를 문장 안에 표시하고 별도 radio로 선택한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SubmitAnswerForm
        inlineSentences={[inlineSentence]}
        options={options.map((option, index) => ({
          id: option.id,
          label: null,
          span: {
            sentenceVersionId: inlineSentence.sentenceVersionId,
            startTokenIndex: index,
            endTokenIndex: index + 1,
          },
        }))}
        questionId='01933b6a-8f13-7a19-b7e5-536d70f57aaa'
        questionVersionId='01933b6a-8f13-7a19-b7e5-536d70f57aab'
      />,
    );

    const marks = screen.getAllByTestId('inline-option-span');
    expect(marks).toHaveLength(2);
    expect(marks.map((mark) => mark.textContent)).toEqual(['ฉัน', 'รัก']);
    const radios = screen.getAllByRole('radio');
    const secondRadio = getRadio(radios, 1);
    expect(secondRadio).toHaveAttribute('aria-describedby', marks[1]?.id);
    await user.click(secondRadio);

    expect(secondRadio).toBeChecked();
    expect(marks[1]?.querySelector('button')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'รัก 뜻과 발음 듣기' }),
    ).toBeVisible();
  });

  it('방향키로 radio를 이동하고 제출 뒤 선택·정답 상태를 유지한다', async () => {
    mocks.submitAnswer.mockResolvedValue(createFeedback(false));
    const user = userEvent.setup();
    renderWithProviders(
      <SubmitAnswerForm
        options={options}
        questionId='01933b6a-8f13-7a19-b7e5-536d70f57aaa'
        questionVersionId='01933b6a-8f13-7a19-b7e5-536d70f57aab'
      />,
    );

    const radios = screen.getAllByRole('radio');
    await user.click(getRadio(radios, 0));
    await user.keyboard('{ArrowDown}');
    expect(getRadio(radios, 1)).toBeChecked();

    await user.keyboard('{ArrowUp}');
    await user.click(screen.getByRole('button', { name: '답안 제출' }));

    expect(
      await screen.findByRole('radio', { name: /선택한 답/ }),
    ).toBeChecked();
    expect(screen.getByText('정답')).toBeVisible();
  });

  it('제출 중 선택을 잠그고 서버가 반환한 option을 선택한 답으로 고정한다', async () => {
    const pending = deferred<ReturnType<typeof createFeedback>>();
    mocks.submitAnswer.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderWithProviders(
      <SubmitAnswerForm
        options={options}
        questionId='01933b6a-8f13-7a19-b7e5-536d70f57aaa'
        questionVersionId='01933b6a-8f13-7a19-b7e5-536d70f57aab'
      />,
    );

    const radios = screen.getAllByRole('radio');
    await user.click(getRadio(radios, 0));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));

    expect(getRadio(radios, 1)).toBeDisabled();
    await user.click(getRadio(radios, 1));
    pending.resolve(createFeedback(false));

    expect(
      await screen.findByRole('radio', { name: /선택한 답/ }),
    ).toHaveAccessibleName(/ตัวเลือกหนึ่ง 선택한 답/);
  });
});

describe('겹치는 인라인 선택지 문맥', () => {
  it('각 행에 원문을 한 번만 표시하고 radio를 해당 span mark와 연결한다', () => {
    renderWithProviders(
      <SubmitAnswerForm
        inlineSentences={[inlineSentence]}
        options={options.map((option, index) => ({
          id: option.id,
          label: null,
          span: {
            sentenceVersionId: inlineSentence.sentenceVersionId,
            startTokenIndex: index,
            endTokenIndex: index + 2,
          },
        }))}
        questionId='01933b6a-8f13-7a19-b7e5-536d70f57aaa'
        questionVersionId='01933b6a-8f13-7a19-b7e5-536d70f57aab'
      />,
    );

    const rows = screen.getAllByTestId('inline-option-row');
    expect(rows).toHaveLength(2);
    const expectedMarks = ['ฉันรัก', 'รักเธอ'];
    rows.forEach((row, index) => {
      const sentence = row.querySelector('[data-testid="inline-sentence"]');
      const mark = row.querySelector('mark');
      const radio = row.querySelector('input[type="radio"]');
      expect(sentence).toHaveTextContent(/^ฉันรักเธอ$/u);
      expect(mark).toHaveTextContent(expectedMarks[index] ?? '');
      expect(mark?.querySelector('button')).toBeNull();
      expect(radio).toHaveAttribute('aria-describedby', mark?.id);
    });
  });
});

function getRadio(radios: HTMLElement[], index: number) {
  const radio = radios.at(index);
  if (radio === undefined) {
    throw new Error(`${index}번 radio가 없습니다.`);
  }
  return radio;
}

function submittedCommand(index: number): SubmitAnswerCommand {
  return mocks.submitAnswer.mock.calls[index]?.[0] as SubmitAnswerCommand;
}

function createFeedback(isCorrect: boolean) {
  return {
    attempt: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57ad1',
      attemptNo: 1,
      isFirst: true,
      isCorrect,
      selectedOptionId: options[0]?.id,
      submittedAt: '2026-07-25T00:00:00.000Z',
    },
    feedback: {
      correctOptionId: options[1]?.id,
      explanationBlocks: [],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
