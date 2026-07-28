/** 문제 후보 URL filter의 기본값과 strict enum을 검증한다 */
import { describe, expect, it } from 'vitest';
import { parseQuestionCandidateSearch } from './questionCandidateSearch';

describe('문제 후보 검색 상태', () => {
  it('빈 검색에 안정적인 page 기본값을 적용한다', () => {
    expect(parseQuestionCandidateSearch({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('알 수 없는 filter는 거절한다', () => {
    expect(() => parseQuestionCandidateSearch({ private: true })).toThrow();
  });
});
