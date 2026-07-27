/** 감사 기록 datetime-local과 ISO URL 간 시간 보존 변환을 검증한다 */
import { describe, expect, it } from 'vitest';
import { fromAuditDatetimeLocal, toAuditDatetimeLocal } from './auditLogSearch';

describe('감사 기록 날짜 검색 변환', () => {
  it('UTC ISO를 local 입력으로 표시한 뒤 같은 시각의 ISO로 복원한다', () => {
    const iso = '2026-07-27T03:04:05.000Z';

    expect(fromAuditDatetimeLocal(toAuditDatetimeLocal(iso))).toBe(iso);
  });

  it('빈 local 입력은 URL filter에서 제거한다', () => {
    expect(fromAuditDatetimeLocal('')).toBeUndefined();
  });
});
