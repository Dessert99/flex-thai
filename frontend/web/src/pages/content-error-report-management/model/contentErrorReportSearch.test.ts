/** 관리자 오류 신고 filter 직렬화가 공개 계약 key만 사용하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { serializeContentErrorReportSearch } from './contentErrorReportSearch';

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
});
