/** 어휘 검색 URL 계약과 태국어 원문 표시를 검증한다 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { VocabularyListPage as VocabularyListPageContainer } from './VocabularyListPage';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/shared/apis/auth/authenticatedRequest')
    >();
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
        saved: false,
      },
    ],
    page: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
  });
});

describe('어휘 목록 추출 섹션', () => {
  it('세 섹션을 제공하고 전환 시 검색 조건을 유지하며 첫 페이지로 돌아간다', async () => {
    const onSearchChange = vi.fn();
    renderWithProviders(
      <VocabularyListPageContainer
        onSearchChange={onSearchChange}
        search={{ query: '학교', page: 2, pageSize: 20 }}
      />,
    );
    await screen.findByText('โรงเรียน');
    expect(screen.getByRole('tab', { name: '모든 단어' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.mouseDown(
      screen.getByRole('tab', { name: '최근에 추출한 단어' }),
      { button: 0, ctrlKey: false },
    );
    expect(onSearchChange).toHaveBeenCalledWith({
      query: '학교',
      section: 'recent',
      page: 1,
      pageSize: 20,
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: '뜻이 추가된 단어' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(onSearchChange).toHaveBeenCalledWith({
      query: '학교',
      section: 'new-meanings',
      page: 1,
      pageSize: 20,
    });
  });

  it('최근 추출 조건을 서버로 보내고 한국어 뜻과 품사를 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValueOnce({
      items: [
        {
          id: 'v',
          thai: 'เรียน',
          kind: 'WORD',
          saved: false,
          meanings: [
            { id: 'm', meaningKo: '배우다', partOfSpeech: 'Verb' },
            { id: 'copula', meaningKo: '~이다', partOfSpeech: 'Copula' },
            {
              id: 'prepositional',
              meaningKo: '~에 따라',
              partOfSpeech: 'Prepositional phrase',
            },
            {
              id: 'verb-phrase',
              meaningKo: '볼 수 없다',
              partOfSpeech: 'Verb phrase',
            },
          ],
        },
      ],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    renderWithProviders(
      <VocabularyListPageContainer
        onSearchChange={vi.fn()}
        search={{ section: 'recent', page: 1, pageSize: 20 }}
      />,
    );
    expect(await screen.findByText('배우다')).toBeInTheDocument();
    expect(screen.getByText('동사')).toBeInTheDocument();
    expect(screen.getByText('계사')).toBeInTheDocument();
    expect(screen.getByText('전치사구')).toBeInTheDocument();
    expect(screen.getByText('동사구')).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/vocabularies?section=recent&page=1&pageSize=20',
      }),
    );
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
      '/vocabularies/01933b6a-8f13-7a19-b7e5-536d70f57aaa?page=1&pageSize=20',
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

  it('history 이동으로 URL query가 바뀌면 검색 input도 새 값으로 동기화한다', async () => {
    const { rerender } = renderWithProviders(
      <VocabularyListPageContainer
        onSearchChange={vi.fn()}
        search={{ query: 'โรงเรียน', page: 1, pageSize: 20 }}
      />,
    );
    await screen.findByText('โรงเรียน');
    expect(screen.getByLabelText('어휘 검색어')).toHaveValue('โรงเรียน');

    rerender(
      <VocabularyListPageContainer
        onSearchChange={vi.fn()}
        search={{ query: '학교', page: 1, pageSize: 20 }}
      />,
    );

    expect(screen.getByLabelText('어휘 검색어')).toHaveValue('학교');
  });
});
