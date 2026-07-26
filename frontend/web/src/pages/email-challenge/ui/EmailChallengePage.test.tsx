/** 이메일 코드 확인·재전송·인증 redirect 흐름을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { EmailChallengePageContainer } from './EmailChallengePageContainer';

const mocks = vi.hoisted(() => ({
  getPendingEmailChallenge: vi.fn(),
  navigate: vi.fn(),
  resendPendingEmailChallenge: vi.fn(),
  verifyEmailCodeSession: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, ...mocks };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-26T00:00:00.000Z'));
  mocks.getPendingEmailChallenge.mockReset();
  mocks.getPendingEmailChallenge.mockReturnValue({
    challengeId: '00000000-0000-4000-8000-000000000001',
    email: 'user@hufs.ac.kr',
    expiresAt: '2026-07-26T00:10:00.000Z',
    resendAt: '2026-07-26T00:01:00.000Z',
  });
  mocks.navigate.mockReset();
  mocks.resendPendingEmailChallenge.mockReset();
  mocks.verifyEmailCodeSession.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('이메일 challenge 페이지', () => {
  it('6자리 code만 제출하고 성공한 학습자를 학습 홈으로 보낸다', async () => {
    vi.useRealTimers();
    mocks.verifyEmailCodeSession.mockResolvedValue({
      status: 'authenticated',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'user@hufs.ac.kr',
        role: 'LEARNER',
        mfaEnrolled: false,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<EmailChallengePageContainer />);

    await user.type(screen.getByLabelText('인증 코드'), '123456');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(mocks.verifyEmailCodeSession).toHaveBeenCalledWith('123456');
    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/learn',
    });
  });

  it('MFA_REQUIRED 응답을 TOTP 화면으로 보낸다', async () => {
    vi.useRealTimers();
    mocks.verifyEmailCodeSession.mockResolvedValue({
      status: 'mfa-required',
    });
    const user = userEvent.setup();
    renderWithProviders(<EmailChallengePageContainer />);

    await user.type(screen.getByLabelText('인증 코드'), '123456');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/login/mfa',
    });
  });

  it('TOTP 등록을 마친 관리자를 관리자 홈으로 보낸다', async () => {
    vi.useRealTimers();
    mocks.verifyEmailCodeSession.mockResolvedValue({
      status: 'authenticated',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'admin@hufs.ac.kr',
        role: 'ADMIN',
        mfaEnrolled: true,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<EmailChallengePageContainer />);

    await user.type(screen.getByLabelText('인증 코드'), '123456');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/admin',
    });
  });
});

describe('이메일 challenge redirect 보존', () => {
  it('인증 완료 뒤 보존한 내부 redirect를 역할 홈보다 우선한다', async () => {
    vi.useRealTimers();
    mocks.verifyEmailCodeSession.mockResolvedValue({
      status: 'authenticated',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'user@hufs.ac.kr',
        role: 'LEARNER',
        mfaEnrolled: false,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(
      <EmailChallengePageContainer redirectTo='/wordbooks' />,
    );

    await user.type(screen.getByLabelText('인증 코드'), '123456');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/wordbooks',
    });
  });

  it('MFA가 필요하면 보존한 redirect를 TOTP 화면에 전달한다', async () => {
    vi.useRealTimers();
    mocks.verifyEmailCodeSession.mockResolvedValue({
      status: 'mfa-required',
    });
    const user = userEvent.setup();
    renderWithProviders(
      <EmailChallengePageContainer redirectTo='/admin/users' />,
    );

    await user.type(screen.getByLabelText('인증 코드'), '123456');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      search: { redirect: '/admin/users' },
      to: '/login/mfa',
    });
  });
});

describe('이메일 challenge 재전송', () => {
  it('resendAt 전에는 재전송 button을 비활성화한다', () => {
    renderWithProviders(<EmailChallengePageContainer />);

    expect(screen.getByRole('button', { name: /재전송/ })).toBeDisabled();
    expect(screen.getByText('60초 후 재전송 가능')).toBeInTheDocument();
  });

  it('resendAt 뒤에는 현재 challenge를 재전송한다', async () => {
    vi.useRealTimers();
    mocks.getPendingEmailChallenge.mockReturnValue({
      challengeId: '00000000-0000-4000-8000-000000000001',
      email: 'user@hufs.ac.kr',
      expiresAt: '2026-07-26T00:10:00.000Z',
      resendAt: '2026-07-25T23:59:59.000Z',
    });
    mocks.resendPendingEmailChallenge.mockResolvedValue({
      challengeId: '00000000-0000-4000-8000-000000000002',
      email: 'user@hufs.ac.kr',
      expiresAt: '2026-07-26T00:11:00.000Z',
      resendAt: '2026-07-26T00:02:00.000Z',
    });
    const user = userEvent.setup();
    renderWithProviders(<EmailChallengePageContainer />);

    await user.click(screen.getByRole('button', { name: '인증 메일 재전송' }));

    expect(mocks.resendPendingEmailChallenge).toHaveBeenCalledOnce();
  });
});
