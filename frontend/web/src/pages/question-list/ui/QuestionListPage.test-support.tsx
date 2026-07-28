/** 문제 목록 화면 테스트가 공유하는 API fake·taxonomy fixture·render 경계를 제공한다 */
import type { RenderResult } from '@testing-library/react';
import { renderWithProviders } from '@/shared/test';
import { QuestionListPageContainer } from './QuestionListPageContainer';
import type { QuestionListSearch } from '../model/questionListSearch';

/** 검색값이 없을 때 route가 제공해야 하는 목록 기본값이다 */
export const defaultSearch: QuestionListSearch = {
  page: 1,
  pageSize: 20,
  sort: 'LATEST',
};

/** taxonomy 필터와 목록 카드가 함께 참조하는 고정 fixture 식별자다 */
export const questionListIds = {
  listeningQuestionType: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
  questionType: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
  tag: '01933b6a-8f13-7a19-b7e5-536d70f57aaf',
  topic: '01933b6a-8f13-7a19-b7e5-536d70f57aae',
};

/** 공개 목록 계약과 같은 taxonomy 선택지를 제공한다 */
export const questionListFacets = {
  majorCategories: [
    { label: '읽기 지문', value: 'READING_PASSAGE' },
    { label: '듣기 대화', value: 'LISTENING_DIALOGUE' },
  ],
  questionTypes: [
    {
      displayName: '읽기 지문 유형',
      id: questionListIds.questionType,
      majorCategory: 'READING_PASSAGE',
      slug: 'reading-passage',
    },
    {
      displayName: '듣기 대화 유형',
      id: questionListIds.listeningQuestionType,
      majorCategory: 'LISTENING_DIALOGUE',
      slug: 'listening-dialogue',
    },
  ],
  tags: [{ displayName: '여행', id: questionListIds.tag, slug: 'travel' }],
  topics: [
    {
      displayName: '일상 회화',
      id: questionListIds.topic,
      slug: 'daily-conversation',
    },
  ],
};

/** 빈 목록 상태를 확인하는 기본 성공 응답이다 */
export const emptyQuestionListResponse = {
  facets: questionListFacets,
  items: [],
  page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
};

interface QuestionListPageTestProps {
  onSearchChange?: (search: QuestionListSearch) => void;
  search?: QuestionListSearch;
}

/** TanStack Router 경계와 동일한 props로 문제 목록 화면을 구성한다 */
export function QuestionListPageTestView({
  onSearchChange = () => undefined,
  search = defaultSearch,
}: QuestionListPageTestProps) {
  return (
    <QuestionListPageContainer
      onSearchChange={onSearchChange}
      search={search}
    />
  );
}

/** TanStack Router 경계와 동일한 props로 문제 목록을 렌더링한다 */
export function renderQuestionList(
  props: QuestionListPageTestProps = {},
): RenderResult {
  return renderWithProviders(<QuestionListPageTestView {...props} />);
}
