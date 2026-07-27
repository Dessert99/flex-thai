/** 문제 탐색의 URL 소유 필터·페이지 상태·복구 가능한 화면 상태를 검증한다 */
import { screen, waitFor, within } from '@testing-library/react';
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

const defaultSearch: QuestionListSearch = {
  page: 1,
  pageSize: 20,
  sort: 'LATEST',
};
const questionTypeId = '01933b6a-8f13-7a19-b7e5-536d70f57aac';
const listeningQuestionTypeId = '01933b6a-8f13-7a19-b7e5-536d70f57aad';
const topicId = '01933b6a-8f13-7a19-b7e5-536d70f57aae';
const tagId = '01933b6a-8f13-7a19-b7e5-536d70f57aaf';
const facets = {
  majorCategories: [
    { label: '읽기 지문', value: 'READING_PASSAGE' },
    { label: '듣기 대화', value: 'LISTENING_DIALOGUE' },
  ],
  questionTypes: [
    {
      displayName: '읽기 지문 유형',
      id: questionTypeId,
      majorCategory: 'READING_PASSAGE',
      slug: 'reading-passage',
    },
    {
      displayName: '듣기 대화 유형',
      id: listeningQuestionTypeId,
      majorCategory: 'LISTENING_DIALOGUE',
      slug: 'listening-dialogue',
    },
  ],
  tags: [{ displayName: '여행', id: tagId, slug: 'travel' }],
  topics: [
    { displayName: '일상 회화', id: topicId, slug: 'daily-conversation' },
  ],
};
const emptyResponse = {
  facets,
  items: [],
  page: {
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  },
};

beforeEach(() => {
  // jsdom에는 Radix Select가 확인하는 pointer capture API가 없어 실제 선택을 보완한다.
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
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
            id: questionTypeId,
            slug: 'reading-context',
            displayName: '문맥에 맞는 표현',
          },
          majorCategory: 'READING_PASSAGE',
          topic: {
            displayName: '일상 회화',
            id: topicId,
            slug: 'daily-conversation',
          },
          tags: [],
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
      facets,
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

describe('문제 목록 taxonomy 필터', () => {
  it('UUID 입력 없이 대분류·유형·주제·태그를 이름 있는 선택지로 제공한다', async () => {
    renderQuestionList();

    await screen.findByRole('heading', { name: '게시된 문제가 없습니다.' });

    expect(screen.queryByLabelText('문제 유형 ID')).not.toBeInTheDocument();
    for (const label of ['대분류', '문제 유형', '주제', '태그']) {
      expect(screen.getAllByRole('combobox', { name: label })).not.toHaveLength(
        0,
      );
    }
  });

  it('대분류 변경은 호환되지 않는 유형을 해제하고 1페이지 검색값을 전달한다', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderQuestionList({
      onSearchChange,
      search: { ...defaultSearch, page: 3, questionTypeId },
    });

    await screen.findByRole('heading', {
      name: '조건에 맞는 문제가 없습니다.',
    });
    const desktopCategory = screen.getAllByRole('combobox', {
      name: '대분류',
    })[0];
    if (desktopCategory === undefined) {
      throw new Error('데스크톱 대분류 선택지가 필요합니다.');
    }
    await user.click(desktopCategory);
    await user.click(await screen.findByRole('option', { name: '듣기 대화' }));

    const [nextSearch] = onSearchChange.mock.lastCall as [QuestionListSearch];
    expect(nextSearch).toMatchObject({
      ...defaultSearch,
      majorCategory: 'LISTENING_DIALOGUE',
      page: 1,
    });
    expect(nextSearch).not.toHaveProperty('questionTypeId');

    rerender(
      <QuestionListPageContainer
        onSearchChange={onSearchChange}
        search={{
          ...defaultSearch,
          majorCategory: 'LISTENING_DIALOGUE',
          page: 1,
        }}
      />,
    );
    const desktopQuestionType = screen.getAllByRole('combobox', {
      name: '문제 유형',
    })[0];
    if (desktopQuestionType === undefined) {
      throw new Error('데스크톱 문제 유형 선택지가 필요합니다.');
    }
    await user.click(desktopQuestionType);

    expect(
      await screen.findByRole('option', { name: '듣기 대화 유형' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: '읽기 지문 유형' }),
    ).not.toBeInTheDocument();
  });

  it('mobile bottom Sheet도 같은 이름의 필터로 1페이지 검색값을 전달한다', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    renderQuestionList({
      onSearchChange,
      search: { ...defaultSearch, page: 4 },
    });

    await screen.findByRole('heading', { name: '게시된 문제가 없습니다.' });
    await user.click(screen.getByRole('button', { name: '필터 열기' }));

    const dialog = screen.getByRole('dialog', { name: '문제 필터' });
    expect(dialog).toHaveClass('bottom-0');
    const mobileCategory = within(dialog).getByRole('combobox', {
      name: '대분류',
    });
    await user.click(mobileCategory);
    await user.click(await screen.findByRole('option', { name: '읽기 지문' }));

    const [nextSearch] = onSearchChange.mock.lastCall as [QuestionListSearch];
    expect(nextSearch).toMatchObject({
      ...defaultSearch,
      majorCategory: 'READING_PASSAGE',
      page: 1,
    });
    expect(nextSearch).not.toHaveProperty('questionTypeId');
  });

  it('taxonomy facet이 비어 있으면 선택지를 비활성 안내로 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      ...emptyResponse,
      facets: { majorCategories: [], questionTypes: [], tags: [], topics: [] },
    });
    renderQuestionList();

    await screen.findByRole('heading', { name: '게시된 문제가 없습니다.' });

    for (const label of ['대분류', '문제 유형', '주제', '태그']) {
      expect(
        screen.getAllByRole('combobox', { name: label })[0],
      ).toBeDisabled();
    }
    expect(screen.getAllByText('선택할 항목이 없습니다.')).not.toHaveLength(0);
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
