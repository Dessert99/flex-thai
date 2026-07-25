/** logout pending·실패 세션 유지·성공 SPA replace를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { LogoutButton } from './LogoutButton';

const mocks = vi.hoisted(() => ({
  logoutSession: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, logoutSession: mocks.logoutSession };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

beforeEach(() => {
  mocks.logoutSession.mockReset();
  mocks.navigate.mockReset();
});

describe('로그아웃 버튼', () => {
  it('요청 중 버튼을 비활성화하고 실패하면 현재 화면에 남는다', async () => {
    const deferred = createDeferred();
    mocks.logoutSession.mockReturnValue(deferred.promise);
    const user = userEvent.setup();
    renderWithProviders(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(screen.getByRole('button', { name: '로그아웃 중' })).toBeDisabled();

    deferred.reject(new ApiError({ kind: 'network' }));
    expect(
      await screen.findByText('로그아웃하지 못했습니다. 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('서버 logout 성공 뒤 로그인으로 SPA replace한다', async () => {
    mocks.logoutSession.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      replace: true,
      to: '/login',
    });
  });
});

function createDeferred() {
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<void>((_resolve, reject) => {
    rejectPromise = reject;
  });

  return {
    promise,
    reject(reason: unknown) {
      rejectPromise?.(reason);
    },
  };
}
