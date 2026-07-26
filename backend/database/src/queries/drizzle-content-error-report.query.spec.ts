/** 관리자 오류 신고 query의 stable pagination 값을 검증한다 */
import { describe, expect, it } from 'vitest';
import { toContentErrorReportPage } from './drizzle-content-error-report.query.js';

describe('오류 신고 관리자 page', () => {
  it('전체 건수로 totalPages를 계산한다', () => {
    expect(toContentErrorReportPage([], 41, 2, 20)).toEqual({
      items: [],
      totalItems: 41,
      page: 2,
      pageSize: 20,
      totalPages: 3,
    });
  });
});
