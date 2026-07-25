/** 접근 거부 화면이 세션 종료 없이 복귀 동작만 요청하는지 검증한다 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenPage } from './ForbiddenPage';

describe('ForbiddenPage', () => {
  it('403 안내 뒤 인증 세션을 건드리지 않고 홈 이동을 요청한다', async () => {
    const onNavigateHome = vi.fn();
    const user = userEvent.setup();

    render(<ForbiddenPage onNavigateHome={onNavigateHome} />);

    expect(
      screen.getByRole('heading', { name: '접근 권한이 없습니다.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '홈으로 돌아가기' }));
    expect(onNavigateHome).toHaveBeenCalledOnce();
  });
});
