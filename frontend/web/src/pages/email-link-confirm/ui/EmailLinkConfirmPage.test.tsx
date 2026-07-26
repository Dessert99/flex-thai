/** 링크 mount 무호출·명시적 POST·redirect를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { EmailLinkConfirmPageContainer } from './EmailLinkConfirmPageContainer';

const mocks = vi.hoisted(() => ({
  confirmEmailLinkSession: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    confirmEmailLinkSession: mocks.confirmEmailLinkSession,
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

beforeEach(() => {
  mocks.confirmEmailLinkSession.mockReset();
  mocks.navigate.mockReset();
  window.history.replaceState(
    {},
    '',
    `/login/confirm?challengeId=00000000-0000-4000-8000-000000000001&token=${'A'.repeat(43)}`,
  );
});

describe('이메일 링크 확인 페이지', () => {
  it('mount만으로 확인 API를 호출하지 않는다', () => {
    renderWithProviders(<EmailLinkConfirmPageContainer />);

    expect(mocks.confirmEmailLinkSession).not.toHaveBeenCalled();
  });

  it('button click의 POST 결과가 MFA면 TOTP 화면으로 이동한다', async () => {
    mocks.confirmEmailLinkSession.mockResolvedValue({
      status: 'mfa-required',
    });
    const user = userEvent.setup();
    renderWithProviders(<EmailLinkConfirmPageContainer />);

    await user.click(screen.getByRole('button', { name: '로그인 확인' }));

    expect(mocks.confirmEmailLinkSession).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      'A'.repeat(43),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/login/mfa',
    });
  });
});
