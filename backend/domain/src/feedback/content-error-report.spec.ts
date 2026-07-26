/** 콘텐츠 오류 신고 상태와 설명 불변식을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assertContentErrorReportTransition,
  ContentErrorReportDomainError,
  normalizeContentErrorReportDescription,
} from './content-error-report.js';

describe('콘텐츠 오류 신고 상태', () => {
  it.each([
    ['OPEN', 'IN_PROGRESS'],
    ['OPEN', 'RESOLVED'],
    ['OPEN', 'REJECTED'],
    ['IN_PROGRESS', 'OPEN'],
    ['IN_PROGRESS', 'RESOLVED'],
    ['IN_PROGRESS', 'REJECTED'],
    ['RESOLVED', 'OPEN'],
    ['REJECTED', 'OPEN'],
  ] as const)('%s에서 %s로 전이한다', (from, to) => {
    expect(() => assertContentErrorReportTransition(from, to)).not.toThrow();
  });

  it('같은 상태와 terminal의 다른 전이를 거부한다', () => {
    expect(() => assertContentErrorReportTransition('OPEN', 'OPEN')).toThrow(
      ContentErrorReportDomainError,
    );
    expect(() =>
      assertContentErrorReportTransition('RESOLVED', 'REJECTED'),
    ).toThrow(ContentErrorReportDomainError);
  });

  it('설명을 정규화하고 1000자를 넘으면 거부한다', () => {
    expect(normalizeContentErrorReportDescription('  설명  ')).toBe('설명');
    expect(normalizeContentErrorReportDescription('   ')).toBeNull();
    try {
      normalizeContentErrorReportDescription('가'.repeat(1001));
      throw new Error('오류가 필요합니다');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'CONTENT_ERROR_REPORT_DESCRIPTION_INVALID',
      });
    }
  });
});
