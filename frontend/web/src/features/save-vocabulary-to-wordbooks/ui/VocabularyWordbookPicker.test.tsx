/** 어휘 membership picker의 다중 상태·서버 확정·실패 보존을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyWordbookPicker } from './VocabularyWordbookPicker';

const vocabularyId = '00000000-0000-4000-8000-000000000103';
const firstId = '00000000-0000-4000-8000-000000000101';
const secondId = '00000000-0000-4000-8000-000000000102';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest
    .mockReset()
    .mockImplementation(
      ({ method, path }: { method?: string; path: string }) => {
        if (method === 'PUT' || method === 'DELETE') return Promise.resolve();
        if (path === '/me/wordbooks') {
          return Promise.resolve({
            items: [summary(firstId, 'FLEX'), summary(secondId, '듣기')],
          });
        }
        return Promise.resolve({ wordbookIds: [firstId] });
      },
    );
});

describe('어휘 단어장 picker', () => {
  it('단어장 목록과 membership을 읽어 여러 checked 상태를 표시한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VocabularyWordbookPicker
        onConfirmed={vi.fn()}
        vocabularyId={vocabularyId}
      />,
    );

    await user.click(screen.getByRole('button', { name: '단어장에 추가' }));

    expect(await screen.findByRole('button', { name: 'FLEX' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '듣기' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('PUT 성공 뒤에만 membership과 any saved 상태를 확정한다', async () => {
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    renderWithProviders(
      <VocabularyWordbookPicker
        onConfirmed={onConfirmed}
        vocabularyId={vocabularyId}
      />,
    );
    await user.click(screen.getByRole('button', { name: '단어장에 추가' }));
    const second = await screen.findByRole('button', { name: '듣기' });
    await user.click(second);

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: `/me/wordbooks/${secondId}/items/${vocabularyId}`,
      }),
    );
    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(onConfirmed).toHaveBeenCalledWith(true);
  });

  it('DELETE 실패 시 기존 membership을 유지하고 오류를 표시한다', async () => {
    mocks.authenticatedRequest.mockImplementation(
      ({ method, path }: { method?: string; path: string }) => {
        if (method === 'DELETE') return Promise.reject(new Error('failed'));
        if (path === '/me/wordbooks') {
          return Promise.resolve({ items: [summary(firstId, 'FLEX')] });
        }
        return Promise.resolve({ wordbookIds: [firstId] });
      },
    );
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    renderWithProviders(
      <VocabularyWordbookPicker
        onConfirmed={onConfirmed}
        vocabularyId={vocabularyId}
      />,
    );
    await user.click(screen.getByRole('button', { name: '단어장에 추가' }));
    const first = await screen.findByRole('button', { name: 'FLEX' });
    await user.click(first);

    expect(
      await screen.findByText('단어장 membership을 변경하지 못했습니다.'),
    ).toBeVisible();
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});

function summary(id: string, name: string) {
  return {
    id,
    name,
    itemCount: 0,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  };
}
