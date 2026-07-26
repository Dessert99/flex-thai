/** 학교 이메일 challenge 시작 화면의 입력·이동·오류를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { LoginPageContainer } from './LoginPageContainer';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  startEmailAuthenticationSession: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    startEmailAuthenticationSession: mocks.startEmailAuthenticationSession,
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.startEmailAuthenticationSession.mockReset();
});

describe('로그인 페이지', () => {
  it('로그인 화면은 학교 이메일만 요청한다', () => {
    renderWithProviders(<LoginPageContainer />);

    expect(screen.getByLabelText('학교 이메일')).toBeVisible();
    expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument();
  });

  it('잘못된 이메일을 서버에 보내지 않고 입력에 초점을 둔다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContainer />);

    await user.click(screen.getByRole('button', { name: '인증 메일 받기' }));

    expect(mocks.startEmailAuthenticationSession).not.toHaveBeenCalled();
    expect(screen.getByLabelText('학교 이메일')).toHaveFocus();
  });

  it('challenge 시작 뒤 코드 입력 화면으로 이동한다', async () => {
    mocks.startEmailAuthenticationSession.mockResolvedValue({
      challengeId: '00000000-0000-4000-8000-000000000001',
      email: 'learner@hufs.ac.kr',
      expiresAt: '2026-07-26T00:10:00.000Z',
      resendAt: '2026-07-26T00:01:00.000Z',
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContainer />);

    await user.type(screen.getByLabelText('학교 이메일'), 'learner@hufs.ac.kr');
    await user.click(screen.getByRole('button', { name: '인증 메일 받기' }));

    expect(mocks.startEmailAuthenticationSession).toHaveBeenCalledWith(
      'learner@hufs.ac.kr',
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/login/challenge',
    });
  });

  it('안전한 로그인 redirect를 코드 입력 화면까지 보존한다', async () => {
    mocks.startEmailAuthenticationSession.mockResolvedValue({
      challengeId: '00000000-0000-4000-8000-000000000001',
      email: 'learner@hufs.ac.kr',
      expiresAt: '2026-07-26T00:10:00.000Z',
      resendAt: '2026-07-26T00:01:00.000Z',
    });
    const user = userEvent.setup();
    renderWithProviders(
      <LoginPageContainer redirectTo='/questions?page=2&pageSize=20' />,
    );

    await user.type(screen.getByLabelText('학교 이메일'), 'learner@hufs.ac.kr');
    await user.click(screen.getByRole('button', { name: '인증 메일 받기' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      search: { redirect: '/questions?page=2&pageSize=20' },
      to: '/login/challenge',
    });
  });

  it('실패 응답에서 계정 존재 여부 대신 일반 문구와 requestId를 표시한다', async () => {
    mocks.startEmailAuthenticationSession.mockRejectedValue(createAuthError());
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContainer />);

    await user.type(screen.getByLabelText('학교 이메일'), 'new@hufs.ac.kr');
    await user.click(screen.getByRole('button', { name: '인증 메일 받기' }));

    expect(
      await screen.findByText(
        '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
      ),
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
      status: 429,
      code: 'EMAIL_DAILY_LIMIT_EXCEEDED',
      requestId: 'request-login',
      fieldErrors: [],
    },
  });
}
