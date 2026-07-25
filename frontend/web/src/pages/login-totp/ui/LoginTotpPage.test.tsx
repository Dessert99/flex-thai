/** 로그인 TOTP 입력 검증·성공 redirect·일반 오류 안내를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { LoginTotpPageContainer } from './LoginTotpPageContainer';

const mocks = vi.hoisted(() => ({
  completeLoginTotpSession: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    completeLoginTotpSession: mocks.completeLoginTotpSession,
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

beforeEach(() => {
  mocks.completeLoginTotpSession.mockReset();
  mocks.navigate.mockReset();
});

describe('로그인 TOTP 페이지', () => {
  it('6자리 숫자가 아닌 코드를 inline으로 거부한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginTotpPageContainer />);

    await user.type(screen.getByLabelText('인증 코드'), '12');
    await user.click(screen.getByRole('button', { name: '인증하기' }));

    expect(mocks.completeLoginTotpSession).not.toHaveBeenCalled();
    expect(screen.getByLabelText('인증 코드')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('인증 코드')).toHaveAttribute(
      'inputmode',
      'numeric',
    );
  });

  it('인증된 관리자를 SPA replace로 관리자 홈에 보낸다', async () => {
    mocks.completeLoginTotpSession.mockResolvedValue({
      status: 'authenticated',
      user: {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        email: 'admin@example.com',
        role: 'ADMIN',
        mfaEnrolled: true,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginTotpPageContainer />);

    await user.type(screen.getByLabelText('인증 코드'), '123456');
    await user.click(screen.getByRole('button', { name: '인증하기' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/admin',
    });
  });
});
