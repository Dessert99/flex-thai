/** 관리자 오류 신고 filter 직렬화가 공개 계약 key만 사용하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  parseContentErrorReportSearch,
  serializeContentErrorReportSearch,
} from './contentErrorReportSearch';

describe('오류 신고 검색 모델', () => {
  it('선택된 filter와 pagination만 URL query로 직렬화한다', () => {
    expect(
      serializeContentErrorReportSearch({
        status: 'OPEN',
        targetKind: 'QUESTION',
        category: 'OTHER',
        page: 2,
        pageSize: 20,
      }),
    ).toBe(
      '?status=OPEN&targetKind=QUESTION&category=OTHER&page=2&pageSize=20',
    );
  });

  it('빈 route search에 pagination 기본값을 적용한다', () => {
    expect(parseContentErrorReportSearch({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('알 수 없는 route search key를 거부한다', () => {
    expect(() =>
      parseContentErrorReportSearch({ page: 1, unknown: true }),
    ).toThrow();
  });
});
