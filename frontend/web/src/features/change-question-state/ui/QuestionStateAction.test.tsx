/** 문제 상태 변경의 확인 Dialog·409·confirmed event를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { QuestionStateAction } from './QuestionStateAction';

const questionId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('문제 상태 변경 확인', () => {
  it('Dialog를 취소하면 상태 action trigger로 초점을 돌려준다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionStateAction
        command={{ action: 'hide', questionId }}
        onConfirmed={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', { name: '문제 숨기기' });

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(trigger).toHaveFocus();
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
  });

  it('숨김은 확인 전 전송하지 않고 서버 성공 뒤 confirmed event를 보낸다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(undefined);
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionStateAction
        command={{ action: 'hide', questionId }}
        onConfirmed={onConfirmed}
      />,
    );

    await user.click(screen.getByRole('button', { name: '문제 숨기기' }));
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '숨기기 확인' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/admin/questions/${questionId}/hide`,
      }),
    );
    expect(onConfirmed).toHaveBeenCalledWith({ action: 'hide', questionId });
  });

  it('409 응답을 inline으로 표시하고 confirmed event를 보내지 않는다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(createProblemError(409));
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionStateAction
        command={{ action: 'hide', questionId }}
        onConfirmed={onConfirmed}
      />,
    );

    await user.click(screen.getByRole('button', { name: '문제 숨기기' }));
    await user.click(screen.getByRole('button', { name: '숨기기 확인' }));

    expect(
      await screen.findByText('현재 상태에서는 이 작업을 수행할 수 없습니다.'),
    ).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '상태를 변경할 수 없습니다.',
      status,
      code: 'QUESTION_STATE_CONFLICT',
      requestId: 'request-state',
      fieldErrors: [],
    },
  });
}
