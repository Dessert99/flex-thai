/** 문제 목록의 taxonomy 선택과 모바일 Sheet 접근성을 독립적으로 검증한다 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  parseQuestionListSearch,
  type QuestionListSearch,
} from '../model/questionListSearch';
import {
  defaultSearch,
  emptyQuestionListResponse,
  QuestionListPageTestView,
  questionListIds,
  renderQuestionList,
} from './QuestionListPage.test-support';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

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
  mocks.authenticatedRequest.mockResolvedValue(emptyQuestionListResponse);
});

it('검색값이 없으면 계약의 1페이지 기본값을 사용한다', () => {
  expect(parseQuestionListSearch({})).toEqual(defaultSearch);
});

it('지원하지 않는 키와 잘못된 페이지 값을 거부한다', () => {
  expect(() => parseQuestionListSearch({ sort: 'popular' })).toThrow();
  expect(() => parseQuestionListSearch({ page: '0' })).toThrow();
  expect(() => parseQuestionListSearch({ pageSize: '101' })).toThrow();
});

it('모바일 필터 Sheet를 이름 있는 버튼으로 연다', async () => {
  const user = userEvent.setup();
  renderQuestionList();

  await screen.findByRole('heading', { name: '게시된 문제가 없습니다.' });
  await user.click(screen.getByRole('button', { name: '필터 열기' }));

  const sheet = screen.getByRole('dialog', { name: '문제 필터' });
  expect(sheet).toHaveAttribute('data-slot', 'sheet-content');
  expect(sheet).toHaveAttribute('data-side', 'bottom');
  expect(sheet).toHaveAttribute('data-state', 'open');
  expect(within(sheet).getByRole('combobox', { name: '대분류' })).toBeEnabled();
});

it('모바일 필터 Sheet를 닫으면 trigger로 초점을 돌려준다', async () => {
  const user = userEvent.setup();
  renderQuestionList();
  await screen.findByRole('heading', { name: '게시된 문제가 없습니다.' });
  const trigger = screen.getByRole('button', { name: '필터 열기' });

  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: '필터 닫기' }));

  await waitFor(() => expect(trigger).toHaveFocus());
});

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

it('대분류 변경은 호환되지 않는 유형을 해제하고 route 기본 페이지 검색값을 전달한다', async () => {
  const onSearchChange = vi.fn();
  const user = userEvent.setup();
  const { rerender } = renderQuestionList({
    onSearchChange,
    search: {
      ...defaultSearch,
      page: 3,
      questionTypeId: questionListIds.questionType,
    },
  });

  await screen.findByRole('heading', { name: '조건에 맞는 문제가 없습니다.' });
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
    page: undefined,
  });
  expect(nextSearch).not.toHaveProperty('questionTypeId');

  rerender(
    <QuestionListPageTestView
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

it('모바일 Sheet에서도 이름 있는 필터로 route 기본 페이지 검색값을 전달한다', async () => {
  const onSearchChange = vi.fn();
  const user = userEvent.setup();
  renderQuestionList({ onSearchChange, search: { ...defaultSearch, page: 4 } });

  await screen.findByRole('heading', { name: '게시된 문제가 없습니다.' });
  await user.click(screen.getByRole('button', { name: '필터 열기' }));

  const sheet = screen.getByRole('dialog', { name: '문제 필터' });
  const mobileCategory = within(sheet).getByRole('combobox', {
    name: '대분류',
  });
  await user.click(mobileCategory);
  await user.click(await screen.findByRole('option', { name: '읽기 지문' }));

  const [nextSearch] = onSearchChange.mock.lastCall as [QuestionListSearch];
  expect(nextSearch).toMatchObject({
    ...defaultSearch,
    majorCategory: 'READING_PASSAGE',
    page: undefined,
  });
  expect(nextSearch).not.toHaveProperty('questionTypeId');
});

it('taxonomy facet이 비어 있으면 선택지를 비활성 안내로 표시한다', async () => {
  mocks.authenticatedRequest.mockResolvedValue({
    ...emptyQuestionListResponse,
    facets: { majorCategories: [], questionTypes: [], tags: [], topics: [] },
  });
  renderQuestionList();

  await screen.findByRole('heading', { name: '게시된 문제가 없습니다.' });

  for (const label of ['대분류', '문제 유형', '주제', '태그']) {
    expect(screen.getAllByRole('combobox', { name: label })[0]).toBeDisabled();
  }
  expect(screen.getAllByText('선택할 항목이 없습니다.')).not.toHaveLength(0);
});
