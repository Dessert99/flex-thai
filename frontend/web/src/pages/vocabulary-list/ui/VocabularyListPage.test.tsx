/** 어휘 검색 URL 계약과 태국어 원문 표시를 검증한다 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyListPageContainer } from './VocabularyListPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockResolvedValue({
    items: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        thai: 'โรงเรียน',
        kind: 'WORD',
        meanings: [],
        pronunciations: [],
        saved: false,
      },
    ],
    page: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
  });
});

describe('어휘 목록 페이지', () => {
  it('서버 태국어 원문을 상세 링크와 lang 속성으로 표시한다', async () => {
    renderWithProviders(
      <VocabularyListPageContainer
        onSearchChange={vi.fn()}
        search={{ page: 2, pageSize: 20 }}
      />,
    );

    expect(await screen.findByText('โรงเรียน')).toHaveAttribute('lang', 'th');
    expect(screen.getByRole('link', { name: 'โรงเรียน' })).toHaveAttribute(
      'href',
      '/vocabularies/01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    );
  });

  it('종류·품사·난이도 filter와 page 이동을 URL search 변경으로 전달한다', async () => {
    const onSearchChange = vi.fn();
    const search = {
      query: 'โรงเรียน',
      kind: 'WORD' as const,
      partOfSpeech: '명사',
      difficulty: 3,
      page: 2,
      pageSize: 20,
    };
    renderWithProviders(
      <VocabularyListPageContainer
        onSearchChange={onSearchChange}
        search={search}
      />,
    );
    await screen.findByText('โรงเรียน');

    fireEvent.change(screen.getByLabelText('어휘 종류'), {
      target: { value: 'EXPRESSION' },
    });
    fireEvent.change(screen.getByLabelText('품사'), {
      target: { value: '동사' },
    });
    fireEvent.change(screen.getByLabelText('난이도'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: '이전' }));

    expect(onSearchChange).toHaveBeenNthCalledWith(1, {
      ...search,
      kind: 'EXPRESSION',
      page: 1,
    });
    expect(onSearchChange).toHaveBeenNthCalledWith(2, {
      ...search,
      partOfSpeech: '동사',
      page: 1,
    });
    expect(onSearchChange).toHaveBeenNthCalledWith(3, {
      ...search,
      difficulty: 4,
      page: 1,
    });
    expect(onSearchChange).toHaveBeenNthCalledWith(4, {
      ...search,
      page: 1,
    });
    expect(screen.getByRole('button', { name: '이전' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    await waitFor(() =>
      expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/vocabularies?query=%E0%B9%82%E0%B8%A3%E0%B8%87%E0%B9%80%E0%B8%A3%E0%B8%B5%E0%B8%A2%E0%B8%99&kind=WORD&partOfSpeech=%EB%AA%85%EC%82%AC&difficulty=3&page=2&pageSize=20',
        }),
      ),
    );
  });
});
