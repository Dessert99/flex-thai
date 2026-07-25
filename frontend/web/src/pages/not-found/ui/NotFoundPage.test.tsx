/** 찾을 수 없는 경로에서 안전한 복귀 navigation을 검증한다 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  it('존재하지 않는 경로에서 홈 이동을 제공한다', async () => {
    const onNavigateHome = vi.fn();
    const user = userEvent.setup();

    render(<NotFoundPage onNavigateHome={onNavigateHome} />);

    expect(
      screen.getByRole('heading', { name: '페이지를 찾을 수 없습니다.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '홈으로 돌아가기' }));
    expect(onNavigateHome).toHaveBeenCalledOnce();
  });
});
