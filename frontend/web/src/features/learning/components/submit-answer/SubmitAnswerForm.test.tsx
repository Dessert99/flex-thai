import { ApiError } from '@/shared/apis/ApiError';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmitAnswerForm } from './SubmitAnswerForm';
const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('../../apis/submit-answer/submitAnswerMutation', () => ({
  submitAnswer: mocks.submit,
}));
beforeEach(() => {
  mocks.submit.mockReset();
});
describe('답안 멱등 제출', () => {
  it('실패 후 재시도에 동일한 요청 ID와 문제 버전을 사용한다', async () => {
    mocks.submit.mockRejectedValue(new ApiError({ kind: 'network' }));
    const user = userEvent.setup();
    renderWithProviders(
      <SubmitAnswerForm
        questionId='question'
        questionVersion={3}
        options={[
          { id: 'a', text: '가' },
          { id: 'b', text: '나' },
        ]}
      />,
    );
    await user.click(screen.getByRole('radio', { name: '가' }));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));
    await user.click(
      await screen.findByRole('button', { name: '같은 답안 다시 제출' }),
    );
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[0]?.[0]).toEqual(
      mocks.submit.mock.calls[1]?.[0],
    );
    expect(mocks.submit.mock.calls[0]?.[0]).toMatchObject({
      questionVersion: 3,
      selectedOptionId: 'a',
    });
  });
});
