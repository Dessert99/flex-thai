/** 문제 탐색의 URL 소유 필터·페이지 상태·복구 가능한 화면 상태를 검증한다 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { changeQuestionListFilters } from '../model/questionListSearch';
import { questionListQueryOptions } from '../api/questionListQueries';
import {
  defaultSearch,
  emptyQuestionListResponse,
  questionListFacets,
  questionListIds,
  renderQuestionList,
} from './QuestionListPage.test-support';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
  mocks.authenticatedRequest.mockResolvedValue(emptyQuestionListResponse);
});

it('데스크톱에서는 필터 aside와 문제 결과를 두 열로 배치한다', async () => {
  renderQuestionList();

  await screen.findByRole('heading', { name: '게시된 문제가 없습니다.' });
  const filterAside = screen.getByRole('complementary', {
    name: '문제 필터',
  });
  const results = screen.getByRole('region', { name: '문제 목록 결과' });
  const layout = filterAside.parentElement;

  expect(layout).toBe(results.parentElement);
  expect(layout).toHaveClass('grid', 'md:grid-cols-[18rem_minmax(0,1fr)]');
  expect(
    filterAside.compareDocumentPosition(results) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('계약이 제공한 문제 요약을 상세 링크로 표시한다', async () => {
  mocks.authenticatedRequest.mockResolvedValue({
    items: [
      {
        questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        questionType: {
          id: questionListIds.questionType,
          slug: 'reading-context',
          displayName: '문맥에 맞는 표현',
        },
        majorCategory: 'READING_PASSAGE',
        topic: {
          displayName: '일상 회화',
          id: questionListIds.topic,
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
    facets: questionListFacets,
  });

  renderQuestionList();

  expect(
    await screen.findByRole('link', { name: '문맥에 맞는 표현' }),
  ).toHaveAttribute('href', '/questions/01933b6a-8f13-7a19-b7e5-536d70f57aaa');
});

it('문제 카드에 taxonomy 이름과 난이도를 표시하고 태그가 없는 카드에는 태그 목록을 만들지 않는다', async () => {
  mocks.authenticatedRequest.mockResolvedValue({
    facets: questionListFacets,
    items: [
      {
        difficulty: 2,
        firstResult: 'UNANSWERED',
        majorCategory: 'READING_PASSAGE',
        questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        questionType: {
          displayName: '문맥에 맞는 표현',
          id: questionListIds.questionType,
          slug: 'reading-context',
        },
        questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        saved: false,
        skill: 'READING',
        tags: [
          { displayName: '여행', id: questionListIds.tag, slug: 'travel' },
        ],
        topic: {
          displayName: '일상 회화',
          id: questionListIds.topic,
          slug: 'daily-conversation',
        },
      },
      {
        difficulty: 3,
        firstResult: 'CORRECT',
        majorCategory: 'READING_PASSAGE',
        questionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab0',
        questionType: {
          displayName: '빈 태그 문제',
          id: questionListIds.questionType,
          slug: 'empty-tags',
        },
        questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
        saved: false,
        skill: 'READING',
        tags: [],
        topic: {
          displayName: '일상 회화',
          id: questionListIds.topic,
          slug: 'daily-conversation',
        },
      },
    ],
    page: {
      page: 1,
      pageSize: 20,
      totalItems: 2,
      totalPages: 1,
    },
  });

  renderQuestionList();

  const taggedQuestion = (
    await screen.findByRole('link', {
      name: '문맥에 맞는 표현',
    })
  ).closest('li');
  if (taggedQuestion === null) {
    throw new Error('taxonomy 정보를 표시할 문제 카드가 필요합니다.');
  }
  expect(
    within(taggedQuestion).getByText('대분류: 읽기 지문'),
  ).toBeInTheDocument();
  expect(
    within(taggedQuestion).getByText('세부 유형: 문맥에 맞는 표현'),
  ).toBeInTheDocument();
  expect(
    within(taggedQuestion).getByText('주제: 일상 회화'),
  ).toBeInTheDocument();
  expect(within(taggedQuestion).getByText('난이도 2')).toBeInTheDocument();
  expect(
    within(taggedQuestion).getByRole('list', { name: '태그' }),
  ).toHaveTextContent('여행');
  const untaggedQuestion = screen
    .getByRole('link', { name: '빈 태그 문제' })
    .closest('li');
  if (untaggedQuestion === null) {
    throw new Error('태그 없는 문제 카드가 필요합니다.');
  }
  expect(
    within(untaggedQuestion).queryByRole('list', { name: '태그' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(questionListIds.questionType),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(questionListIds.topic)).not.toBeInTheDocument();
  expect(screen.queryByText(questionListIds.tag)).not.toBeInTheDocument();
});

it('페이지 이동은 선택한 taxonomy 필터를 보존한다', async () => {
  const onSearchChange = vi.fn();
  const user = userEvent.setup();
  const search = {
    ...defaultSearch,
    majorCategory: 'READING_PASSAGE' as const,
    page: 2,
    tagId: questionListIds.tag,
    topicId: questionListIds.topic,
  };
  mocks.authenticatedRequest.mockResolvedValue({
    ...emptyQuestionListResponse,
    items: [
      {
        difficulty: 2,
        firstResult: 'UNANSWERED',
        majorCategory: 'READING_PASSAGE',
        questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        questionType: {
          displayName: '문맥에 맞는 표현',
          id: questionListIds.questionType,
          slug: 'reading-context',
        },
        questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        saved: false,
        skill: 'READING',
        tags: [],
        topic: {
          displayName: '일상 회화',
          id: questionListIds.topic,
          slug: 'daily-conversation',
        },
      },
    ],
    page: { page: 2, pageSize: 20, totalItems: 3, totalPages: 3 },
  });
  renderQuestionList({ onSearchChange, search });

  await screen.findByRole('button', { name: '다음' });
  await user.click(screen.getByRole('button', { name: '다음' }));
  expect(onSearchChange).toHaveBeenLastCalledWith({ ...search, page: 3 });

  await user.click(screen.getByRole('button', { name: '이전' }));
  expect(onSearchChange).toHaveBeenLastCalledWith({ ...search, page: 1 });
});

it('taxonomy 필터 값은 다른 TanStack Query key를 만든다', () => {
  const baseKey = questionListQueryOptions(defaultSearch).queryKey;
  const filteredKey = questionListQueryOptions({
    ...defaultSearch,
    majorCategory: 'READING_PASSAGE',
    tagId: questionListIds.tag,
    topicId: questionListIds.topic,
  }).queryKey;

  expect(filteredKey).toEqual([
    'learner',
    'questions',
    'list',
    {
      ...defaultSearch,
      majorCategory: 'READING_PASSAGE',
      tagId: questionListIds.tag,
      topicId: questionListIds.topic,
    },
  ]);
  expect(filteredKey).not.toEqual(baseKey);
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
    .mockResolvedValueOnce(emptyQuestionListResponse);
  const user = userEvent.setup();
  renderQuestionList();

  expect(
    await screen.findByText('문제 목록을 불러오지 못했습니다.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '다시 시도' }));

  expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
});
