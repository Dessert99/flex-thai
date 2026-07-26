/** 단어장 생성·이름 변경·삭제의 확정 상태와 오류 보존을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { WordbookActions } from './WordbookActions';
import { WordbookForm } from './WordbookForm';

const id = '00000000-0000-4000-8000-000000000101';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
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

describe('단어장 생성과 이름 변경', () => {
  it('이름을 trim해 생성하고 성공 뒤 목록을 무효화한다', async () => {
    const user = userEvent.setup();
    const rendered = renderWithProviders(<WordbookForm />);
    const invalidate = vi.spyOn(rendered.queryClient, 'invalidateQueries');

    await user.type(screen.getByLabelText('새 단어장 이름'), ' FLEX ');
    await user.click(screen.getByRole('button', { name: '단어장 만들기' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { name: 'FLEX' },
        method: 'POST',
        path: '/me/wordbooks',
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['learner', 'wordbooks'],
    });
  });

  it('변경 실패 시 기존 이름과 인라인 오류를 유지한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(new Error('failed'));
    const user = userEvent.setup();
    renderWithProviders(
      <WordbookActions
        name='기존 이름'
        wordbookId={id}
      />,
    );

    await user.click(screen.getByRole('button', { name: '이름 변경' }));
    const input = screen.getByLabelText('단어장 이름');
    await user.clear(input);
    await user.type(input, '새 이름');
    await user.click(screen.getByRole('button', { name: '변경 저장' }));

    expect(await screen.findByText('단어장 이름을 변경하지 못했습니다.')).toBeVisible();
    expect(input).toHaveValue('새 이름');
  });
});

describe('단어장 삭제', () => {
  it('확인 Dialog에서만 삭제하고 성공 뒤 목록을 무효화한다', async () => {
    const user = userEvent.setup();
    const rendered = renderWithProviders(
      <WordbookActions
        name='FLEX 어휘'
        wordbookId={id}
      />,
    );
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
