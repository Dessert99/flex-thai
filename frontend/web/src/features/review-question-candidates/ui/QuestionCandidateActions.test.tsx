/** 문제 후보 검수 버튼의 명시적 command 연결을 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionCandidateActions } from './QuestionCandidateActions';

describe('QuestionCandidateActions', () => {
  it('승인·재생성·폐기 행동을 각각 한 번 전달한다', () => {
    const handlers = {
      onApprove: vi.fn(),
      onDiscard: vi.fn(),
      onRegenerate: vi.fn(),
    };
    render(<QuestionCandidateActions {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.click(screen.getByRole('button', { name: '재생성' }));
    fireEvent.click(screen.getByRole('button', { name: '폐기' }));
    expect(handlers.onApprove).toHaveBeenCalledOnce();
    expect(handlers.onRegenerate).toHaveBeenCalledOnce();
    expect(handlers.onDiscard).toHaveBeenCalledOnce();
  });

  it('실패 후보에서는 승인만 막을 수 있다', () => {
    render(
      <QuestionCandidateActions
        approveDisabled
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '승인' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '재생성' })).toBeEnabled();
  });
});
