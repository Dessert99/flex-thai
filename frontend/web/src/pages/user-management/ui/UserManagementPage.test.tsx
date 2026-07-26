/** 사용자 상태 변경과 non-gating beta 안내 추적 UI를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { UserManagementPage } from './UserManagementPage';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

const listResponse = {
  items: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      email: 'learner@hufs.ac.kr',
      role: 'LEARNER',
      status: 'ACTIVE',
      mfaEnrolled: false,
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    },
  ],
} as const;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
  mocks.authenticatedRequest.mockImplementation(
    ({ method }: { method?: string }) =>
      Promise.resolve(method === undefined ? listResponse : undefined),
  );
});

describe('사용자 관리 페이지', () => {
  it('사용자 상태를 ACTIVE에서 DISABLED로 변경한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserManagementPage />);

    expect(await screen.findByText('learner@hufs.ac.kr')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '비활성화' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { status: 'DISABLED' },
        method: 'PATCH',
        path: '/admin/users/00000000-0000-4000-8000-000000000002/status',
      }),
    );
  });

  it('beta 안내는 가입 승인 없이 이메일 발송 기록만 남긴다고 안내한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserManagementPage />);

    await screen.findByText('learner@hufs.ac.kr');
    await user.type(screen.getByLabelText('학교 이메일'), 'new@hufs.ac.kr');
    await user.click(screen.getByRole('button', { name: 'beta 안내 기록' }));

    expect(
      screen.getByText('이 기록은 가입 권한을 제한하지 않습니다.'),
    ).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: 'new@hufs.ac.kr' },
        method: 'POST',
        path: '/admin/users/invitations',
      }),
    );
  });

  it('상태 변경 실패를 관리자가 다시 시도할 수 있게 알린다', async () => {
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) =>
        method === 'PATCH'
          ? Promise.reject(new Error('status failed'))
          : Promise.resolve(listResponse),
    );
    const user = userEvent.setup();
    renderWithProviders(<UserManagementPage />);

    await user.click(await screen.findByRole('button', { name: '비활성화' }));

    expect(
      await screen.findByText(
        '사용자 상태를 변경하지 못했습니다. 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument();
  });

  it('beta 안내 기록 실패를 일반 문구로 알린다', async () => {
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) =>
        method === 'POST'
          ? Promise.reject(new Error('invitation failed'))
          : Promise.resolve(listResponse),
    );
    const user = userEvent.setup();
    renderWithProviders(<UserManagementPage />);

    await screen.findByText('learner@hufs.ac.kr');
    await user.type(screen.getByLabelText('학교 이메일'), 'new@hufs.ac.kr');
    await user.click(screen.getByRole('button', { name: 'beta 안내 기록' }));

    expect(
      await screen.findByText(
        'beta 안내를 기록하지 못했습니다. 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument();
  });
});
