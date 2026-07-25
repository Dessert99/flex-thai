/** 로그인 검증·MFA 전환·인증 완료 redirect·안전한 오류 안내를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { LoginPageContainer } from './LoginPageContainer';

const mocks = vi.hoisted(() => ({
  loginSession: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, loginSession: mocks.loginSession };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

beforeEach(() => {
  mocks.loginSession.mockReset();
  mocks.navigate.mockReset();
});

describe('로그인 페이지', () => {
  it('잘못된 입력을 서버에 보내지 않고 첫 오류 입력에 초점을 둔다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContainer />);

    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(mocks.loginSession).not.toHaveBeenCalled();
    expect(screen.getByLabelText('이메일')).toHaveFocus();
    expect(screen.getByLabelText('이메일')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('인증된 학습자를 SPA replace로 학습 홈에 보낸다', async () => {
    mocks.loginSession.mockResolvedValue({
      status: 'authenticated',
      user: {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        email: 'learner@example.com',
        role: 'LEARNER',
        mfaEnrolled: false,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContainer />);

    await user.type(screen.getByLabelText('이메일'), 'learner@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/learn',
    });
  });

  it('MFA_REQUIRED에서 challenge 원문 없이 TOTP 페이지로 이동한다', async () => {
    mocks.loginSession.mockResolvedValue({ status: 'mfa-required' });
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContainer />);

    await user.type(screen.getByLabelText('이메일'), 'admin@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/login/mfa',
    });
    expect(screen.queryByText(/challenge/iu)).not.toBeInTheDocument();
  });

  it('인증 실패에 서버 title 대신 일반 문구와 requestId를 표시한다', async () => {
    mocks.loginSession.mockRejectedValue(createAuthError());
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContainer />);

    await user.type(screen.getByLabelText('이메일'), 'admin@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(
      await screen.findByText('이메일 또는 비밀번호를 확인해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('요청 ID: request-login')).toBeInTheDocument();
    expect(
      screen.queryByText('계정이 존재하지 않습니다'),
    ).not.toBeInTheDocument();
  });
});

function createAuthError() {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: 'https://flex-thia.dev/problems/auth',
      title: '계정이 존재하지 않습니다',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      requestId: 'request-login',
      fieldErrors: [],
    },
  });
}
