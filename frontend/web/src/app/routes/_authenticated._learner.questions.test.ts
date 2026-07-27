/** 문제 탐색 URL 상태가 실제 API 요청과 route 검증 경계에서 보존되는지 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { questionListQueryOptions } from '@/pages/question-list/api/questionListQueries';
import { parseQuestionListSearch } from '@/pages/question-list';
import { createTestQueryClient } from '@/shared/test';
import { Route } from './_authenticated._learner.questions';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('학습자 문제 목록 route 검색값', () => {
  it('모든 검색 필드를 실제 API query와 route parser 경계까지 보존한다', async () => {
    const expectedSearch = {
      difficulty: 4,
      firstResult: 'INCORRECT',
      majorCategory: 'READING_PASSAGE',
      page: 3,
      pageSize: 50,
      questionTypeId: '11111111-1111-4111-8111-111111111111',
      saved: false,
      skill: 'READING',
      sort: 'LATEST',
      tagId: '33333333-3333-4333-8333-333333333333',
      topicId: '22222222-2222-4222-8222-222222222222',
    };
    const search = parseQuestionListSearch({
      difficulty: '4',
      firstResult: 'INCORRECT',
      majorCategory: 'READING_PASSAGE',
      page: '3',
      pageSize: '50',
      questionTypeId: '11111111-1111-4111-8111-111111111111',
      saved: 'false',
      skill: 'READING',
      sort: 'LATEST',
      tagId: '33333333-3333-4333-8333-333333333333',
      topicId: '22222222-2222-4222-8222-222222222222',
    });
    expect(search).toEqual(expectedSearch);
    mocks.authenticatedRequest.mockResolvedValue({ items: [] });

    await createTestQueryClient().fetchQuery(questionListQueryOptions(search));

    const request = mocks.authenticatedRequest.mock.calls.at(0)?.[0] as
      { path: string } | undefined;
    expect(request).toBeDefined();
    if (request === undefined) {
      throw new Error('문제 목록 API 요청이 실행되어야 합니다.');
    }
    const requestUrl = new URL(request.path, 'https://flex-thia.test');
    const validateSearch = Route.options.validateSearch;
    expect(validateSearch).toBeTypeOf('function');
    if (typeof validateSearch !== 'function') {
      throw new Error('문제 목록 route search parser가 필요합니다.');
    }

    expect(
      validateSearch(Object.fromEntries(requestUrl.searchParams.entries())),
    ).toEqual(expectedSearch);
  });
});
