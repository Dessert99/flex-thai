/** 관리자 TOTP secret 표시·코드 검증·등록 성공 redirect를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { TotpSetupPageContainer } from './TotpSetupPageContainer';

const mocks = vi.hoisted(() => ({
  beginTotpSetup: vi.fn(),
  navigate: vi.fn(),
  verifyTotpSetup: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    beginTotpSetup: mocks.beginTotpSetup,
    verifyTotpSetup: mocks.verifyTotpSetup,
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

beforeEach(() => {
  mocks.beginTotpSetup.mockReset();
  mocks.navigate.mockReset();
  mocks.verifyTotpSetup.mockReset();
});

describe('TOTP 등록 페이지', () => {
  it('서버가 준 secretCode만 등록 중에 표시한다', async () => {
    mocks.beginTotpSetup.mockResolvedValue({
      secretCode: 'ABCDEFGHIJKLMNOP',
    });
    const user = userEvent.setup();
    renderWithProviders(<TotpSetupPageContainer />);

    expect(screen.queryByText('ABCDEFGHIJKLMNOP')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '등록 시작' }));

    expect(await screen.findByText('ABCDEFGHIJKLMNOP')).toBeInTheDocument();
    expect(screen.queryByText(/otpauth/iu)).not.toBeInTheDocument();
  });

  it('등록 확인 성공 후 SPA replace로 관리자 홈에 보낸다', async () => {
    mocks.beginTotpSetup.mockResolvedValue({
      secretCode: 'ABCDEFGHIJKLMNOP',
    });
    mocks.verifyTotpSetup.mockResolvedValue({
      id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
      email: 'admin@example.com',
      role: 'ADMIN',
      mfaEnrolled: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<TotpSetupPageContainer />);

    await user.click(screen.getByRole('button', { name: '등록 시작' }));
    await user.type(await screen.findByLabelText('인증 코드'), '123456');
    await user.click(screen.getByRole('button', { name: '등록 완료' }));

    expect(mocks.verifyTotpSetup.mock.calls[0]?.[0]).toEqual({
      code: '123456',
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/admin',
    });
  });
});
