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
  },
  {
    id: '01933b6a-8f13-7a19-b7e5-536d70f57ab2',
    label: 'ตัวเลือกสอง',
  },
];

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
