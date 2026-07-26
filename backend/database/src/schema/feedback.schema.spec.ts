/** 콘텐츠 오류 신고 schema의 상태·FK·index와 중복 허용을 고정한다 */
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  contentErrorReportHistory,
  contentErrorReports,
} from './feedback.schema.js';

describe('콘텐츠 오류 신고 schema', () => {
  it('신고와 append-only 처리 이력 열을 정의한다', () => {
    const report = getTableConfig(contentErrorReports);
    const history = getTableConfig(contentErrorReportHistory);
    expect(report.columns.map(({ name }) => name)).toEqual([
      'id',
      'reporter_user_id',
      'target_kind',
      'category',
      'status',
      'assignee_user_id',
      'description',
      'canonical_reference',
      'snapshot',
      'created_at',
      'updated_at',
    ]);
    expect(history.columns.map(({ name }) => name)).toContain('action');
    expect(report.indexes).toHaveLength(3);
    expect(report.uniqueConstraints).toHaveLength(0);
  });

  it('OPEN 기본값과 1000자 설명을 사용한다', () => {
    const config = getTableConfig(contentErrorReports);
    const status = config.columns.find(({ name }) => name === 'status');
    const description = config.columns.find(
      ({ name }) => name === 'description',
    );
    expect(status?.default).toBe('OPEN');
    expect(description?.getSQLType()).toBe('varchar(1000)');
  });
});
