/** 어휘 검색 URL 계약과 태국어 원문 표시를 검증한다 */
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { parseVocabularyListSearch } from '../model/vocabularyListSearch';
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

describe('어휘 목록 검색', () => {
  it('태국어·한국어 검색어와 계약 필터·페이지를 보존한다', () => {
    expect(
      parseVocabularyListSearch({
        query: 'โรงเรียน 학교',
        kind: 'WORD',
        partOfSpeech: '명사',
        difficulty: '3',
        page: '2',
        pageSize: '20',
      }),
    ).toEqual({
      query: 'โรงเรียน 학교',
      kind: 'WORD',
      partOfSpeech: '명사',
      difficulty: 3,
      page: 2,
      pageSize: 20,
    });
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
});
