/** 문제 저장이 서버 확정 뒤에만 UI와 Page callback에 반영되는지 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { SavedQuestionButton } from './SavedQuestionButton';

const mocks = vi.hoisted(() => ({ changeSavedQuestion: vi.fn() }));

vi.mock('../api/savedQuestionMutation', () => ({
  changeSavedQuestion: mocks.changeSavedQuestion,
}));

describe('문제 저장 버튼', () => {
  it('서버 성공 전에는 저장 상태를 바꾸지 않고 성공 뒤 callback을 호출한다', async () => {
    let confirmRequest: (saved: boolean) => void = () => undefined;
    mocks.changeSavedQuestion.mockReturnValue(
      new Promise<boolean>((resolve) => {
        confirmRequest = resolve;
      }),
    );
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SavedQuestionButton
        onConfirmed={onConfirmed}
        questionId='01933b6a-8f13-7a19-b7e5-536d70f57aaa'
        saved={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: '문제 저장' }));

    expect(screen.getByRole('button', { name: '문제 저장' })).toBeDisabled();
    expect(onConfirmed).not.toHaveBeenCalled();
    confirmRequest(true);
    expect(
      await screen.findByRole('button', { name: '문제 저장 해제' }),
    ).toBeInTheDocument();
    expect(onConfirmed).toHaveBeenCalledWith(true);
  });
});
