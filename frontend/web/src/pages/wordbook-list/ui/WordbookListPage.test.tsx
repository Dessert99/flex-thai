/** 단어장 목록 화면의 빈 상태·목록·상세 링크를 검증한다 */
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { WordbookListPageContainer } from './WordbookListPageContainer';

const id = '00000000-0000-4000-8000-000000000101';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('단어장 목록 페이지', () => {
  it('빈 목록에도 단어장 만들기 입력과 안내를 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({ items: [] });

    renderWithProviders(<WordbookListPageContainer />);

    expect(await screen.findByText('아직 단어장이 없습니다.')).toBeVisible();
    expect(screen.getByLabelText('새 단어장 이름')).toBeVisible();
    expect(screen.getByRole('button', { name: '단어장 만들기' })).toBeVisible();
  });

  it('단어장 이름·항목 수·상세 링크를 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      items: [
        {
          id,
          name: 'FLEX 어휘',
          itemCount: 3,
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z',
        },
      ],
    });

    renderWithProviders(<WordbookListPageContainer />);

    expect(await screen.findByText('FLEX 어휘')).toBeVisible();
    expect(screen.getByText('3개 항목')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'FLEX 어휘 열기' }),
    ).toHaveAttribute('href', `/wordbooks/${id}`);
  });
});
