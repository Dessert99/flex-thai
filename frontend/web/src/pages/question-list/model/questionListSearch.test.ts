/** 문제 탐색 URL 검색 모델의 계약·페이지 초기화 동작을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  applyQuestionFilterPatch,
  parseQuestionListSearch,
} from './questionListSearch';

const questionTypeId = '11111111-1111-4111-8111-111111111111';
const topicId = '22222222-2222-4222-8222-222222222222';
const tagId = '33333333-3333-4333-8333-333333333333';

describe('questionListSearch', () => {
  it('URL 입력의 모든 문제 탐색 조건을 보존한다', () => {
    const search = parseQuestionListSearch({
      difficulty: '4',
      firstResult: 'INCORRECT',
      majorCategory: 'READING_PASSAGE',
      page: '3',
      pageSize: '50',
      questionTypeId,
      saved: 'false',
      skill: 'READING',
      sort: 'LATEST',
      tagId,
      topicId,
    });

    expect(search).toEqual({
      difficulty: 4,
      firstResult: 'INCORRECT',
      majorCategory: 'READING_PASSAGE',
      page: 3,
      pageSize: 50,
      questionTypeId,
      saved: false,
      skill: 'READING',
      sort: 'LATEST',
      tagId,
      topicId,
    });
  });

  it('빈 문자열은 선택하지 않은 URL 조건으로 정규화한다', () => {
    expect(
      parseQuestionListSearch({
        page: '',
        pageSize: '',
        questionTypeId: '',
        sort: '',
        tagId: '',
        topicId: '',
      }),
    ).toEqual({ page: 1, pageSize: 20, sort: 'LATEST' });
  });

  it.each([
    { skill: 'SPEAKING' },
    { majorCategory: 'LISTENING' },
    { questionTypeId: 'not-a-uuid' },
    { difficulty: '6' },
    { saved: 'yes' },
    { page: '0' },
    { unknown: true },
  ])('계약 범위 밖 URL 조건을 거부한다: %o', (search) => {
    expect(() => parseQuestionListSearch(search)).toThrow();
  });

  it('필터 patch는 현재 페이지를 비워 route 기본 페이지로 돌아가게 한다', () => {
    const search = parseQuestionListSearch({
      difficulty: 2,
      firstResult: 'UNANSWERED',
      majorCategory: 'READING_VOCABULARY_GRAMMAR',
      page: 4,
      pageSize: 50,
      questionTypeId,
      saved: true,
      skill: 'READING',
      tagId,
      topicId,
    });

    expect(applyQuestionFilterPatch(search, { difficulty: 5 })).toEqual({
      ...search,
      difficulty: 5,
      page: undefined,
    });
  });

  it('페이지 전용 patch는 선택한 필터를 유지한다', () => {
    const search = parseQuestionListSearch({
      difficulty: 2,
      firstResult: 'UNANSWERED',
      majorCategory: 'READING_VOCABULARY_GRAMMAR',
      page: 4,
      pageSize: 50,
      questionTypeId,
      saved: true,
      skill: 'READING',
      tagId,
      topicId,
    });

    expect(applyQuestionFilterPatch(search, { page: 2 })).toEqual({
      ...search,
      page: 2,
    });
  });
});
