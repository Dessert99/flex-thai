/** 관리자 오류 신고 대상 deep-link mapping을 검증한다 */
import { describe, expect, it } from 'vitest';
import { toContentErrorReportTargetLink } from './contentErrorReportTargetLink';

describe('오류 신고 대상 링크', () => {
  it('문제와 어휘만 기존 소유 화면으로 연결한다', () => {
    expect(
      toContentErrorReportTargetLink({ kind: 'QUESTION', contentId: 'q' }),
    ).toBe('/admin/questions/q');
    expect(
      toContentErrorReportTargetLink({ kind: 'VOCABULARY', contentId: 'v' }),
    ).toBe('/admin/vocabularies/v');
    expect(
      toContentErrorReportTargetLink({ kind: 'CONCEPT', contentId: 'c' }),
    ).toBeNull();
  });
});
