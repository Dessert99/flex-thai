/** 문제 탐색의 URL 소유 필터·페이지 상태·복구 가능한 화면 상태를 검증한다 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import {
  changeQuestionListFilters,
  parseQuestionListSearch,
  type QuestionListSearch,
} from '../model/questionListSearch';
import { QuestionListPageContainer } from './QuestionListPageContainer';

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

const defaultSearch: QuestionListSearch = { page: 1, pageSize: 20 };
const emptyResponse = {
  items: [],
  page: {
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  },
};

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
  mocks.authenticatedRequest.mockResolvedValue(emptyResponse);
});

describe('문제 목록 검색 검증', () => {
  it('검색값이 없으면 계약의 1페이지 기본값을 사용한다', () => {
    expect(parseQuestionListSearch({})).toEqual(defaultSearch);
  });

  it('지원하지 않는 키와 잘못된 페이지 값을 거부한다', () => {
    expect(() => parseQuestionListSearch({ sort: 'popular' })).toThrow();
    expect(() => parseQuestionListSearch({ page: '0' })).toThrow();
    expect(() => parseQuestionListSearch({ pageSize: '101' })).toThrow();
  });
});

describe('문제 목록 페이지', () => {
  it('계약이 제공한 문제 요약을 상세 링크로 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      items: [
        {
          questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
          questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
          questionType: {
            id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
            slug: 'reading-context',
            displayName: '문맥에 맞는 표현',
          },
          skill: 'READING',
          difficulty: 2,
          saved: false,
          firstResult: 'UNANSWERED',
        },
      ],
      page: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    });

    renderQuestionList();

    expect(
      await screen.findByRole('link', { name: '문맥에 맞는 표현' }),
    ).toHaveAttribute(
      'href',
      '/questions/01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    );
  });

  it('필터 변경 시 URL 검색값의 페이지를 1로 되돌린다', () => {
    expect(
      changeQuestionListFilters(
        { ...defaultSearch, page: 3 },
        { skill: 'LISTENING' },
      ),
    ).toEqual({
      ...defaultSearch,
      page: 1,
      skill: 'LISTENING',
    });
  });

  it('문제를 불러오는 동안 로딩 상태를 제공한다', () => {
    mocks.authenticatedRequest.mockReturnValue(new Promise(() => undefined));

    renderQuestionList();

    expect(screen.getByRole('status')).toHaveTextContent(
      '문제를 불러오고 있습니다.',
    );
  });

  it('필터 없는 빈 응답은 게시 콘텐츠가 없는 상태로 안내한다', async () => {
    renderQuestionList();

    expect(
      await screen.findByRole('heading', {
        name: '게시된 문제가 없습니다.',
      }),
    ).toBeInTheDocument();
  });

  it('필터 결과가 비면 조건을 바꾸는 행동을 안내한다', async () => {
    renderQuestionList({
      search: { ...defaultSearch, difficulty: 5 },
    });

    expect(
      await screen.findByRole('heading', {
        name: '조건에 맞는 문제가 없습니다.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: '필터 초기화' }),
    ).not.toHaveLength(0);
  });

  it('요청 실패를 안전하게 안내하고 사용자가 다시 시도할 수 있다', async () => {
    mocks.authenticatedRequest
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(emptyResponse);
    const user = userEvent.setup();
    renderQuestionList();

    expect(
      await screen.findByText('문제 목록을 불러오지 못했습니다.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
  });
});

describe('문제 목록 모바일 필터', () => {
  it('모바일 필터 Sheet를 이름 있는 버튼으로 연다', async () => {
    const user = userEvent.setup();
    renderQuestionList();

    await screen.findByRole('heading', {
      name: '게시된 문제가 없습니다.',
    });
    await user.click(screen.getByRole('button', { name: '필터 열기' }));

    expect(
      screen.getByRole('dialog', { name: '문제 필터' }),
    ).toBeInTheDocument();
  });

  it('모바일 필터 Sheet를 닫으면 trigger로 초점을 돌려준다', async () => {
    const user = userEvent.setup();
    renderQuestionList();
    await screen.findByRole('heading', {
      name: '게시된 문제가 없습니다.',
    });
    const trigger = screen.getByRole('button', { name: '필터 열기' });

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '필터 닫기' }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

function renderQuestionList({
  onSearchChange = vi.fn(),
  search = defaultSearch,
}: {
  onSearchChange?: (search: QuestionListSearch) => void;
  search?: QuestionListSearch;
} = {}) {
  return renderWithProviders(
    <QuestionListPageContainer
      onSearchChange={onSearchChange}
      search={search}
    />,
  );
}
