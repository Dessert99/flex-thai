/** root route가 예상하지 못한 render 오류와 취소를 안전하게 복구하는지 검증한다 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { RootRouteError } from './__root';

describe('root route 오류 경계', () => {
  it('render 예외에 일반 문구를 표시하고 boundary reset을 실행한다', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();

    render(
      <RootRouteError
        error={new Error('render 상세')}
        reset={reset}
      />,
    );

    expect(
      screen.getByText(
        '예상하지 못한 문제가 발생했습니다. 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('Problem 요청 ID를 표시하되 서버 title은 숨긴다', () => {
    render(
      <RootRouteError
        error={
          new ApiError({
            kind: 'problem',
            problem: {
              type: 'https://flex-thia.dev/problems/internal',
              title: '노출하면 안 되는 title',
              status: 500,
              code: 'UNKNOWN_SERVER_CODE',
              requestId: 'request-boundary',
              fieldErrors: [],
            },
          })
        }
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText('요청 ID: request-boundary')).toBeInTheDocument();
    expect(
      screen.queryByText('노출하면 안 되는 title'),
    ).not.toBeInTheDocument();
  });

  it('취소된 요청에는 전역 오류 화면을 표시하지 않는다', () => {
    const { container } = render(
      <RootRouteError
        error={new ApiError({ kind: 'cancelled' })}
        reset={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
