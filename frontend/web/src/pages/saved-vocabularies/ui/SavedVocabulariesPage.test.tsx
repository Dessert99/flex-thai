/** 저장 어휘가 없는 상태의 단일 collection 안내를 검증한다 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { SavedVocabulariesPageContainer } from './SavedVocabulariesPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

describe('저장한 어휘 페이지', () => {
  it('저장 항목이 없으면 어휘 검색 경로를 안내한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      items: [],
      page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    renderWithProviders(<SavedVocabulariesPageContainer />);

    expect(
      await screen.findByRole('heading', {
        name: '저장한 어휘가 없습니다.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '어휘 찾기' })).toHaveAttribute(
      'href',
      '/vocabularies',
    );
  });
});
