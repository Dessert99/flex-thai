/** 단어장 삭제 확인과 목록 갱신을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { WordbookActions } from './WordbookActions';

const id = '00000000-0000-4000-8000-000000000101';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/shared/apis/auth/authenticatedRequest')
    >();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue({
    id,
    name: 'FLEX 어휘',
    itemCount: 0,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  });
});

describe('단어장 삭제', () => {
  it('확인 Dialog에서만 삭제하고 성공 뒤 목록을 무효화한다', async () => {
    const user = userEvent.setup();
    const rendered = renderWithProviders(<WordbookActions wordbookId={id} />);
    const invalidate = vi.spyOn(rendered.queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        path: `/me/wordbooks/${id}`,
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['learner', 'wordbooks'],
    });
  });
});
