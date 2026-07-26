/** 콘텐츠 오류 신고 schema의 상태·FK·index와 중복 허용을 고정한다 */
import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  contentErrorReportCategoryEnum,
  contentErrorReportHistory,
  contentErrorReportHistoryActionEnum,
  contentErrorReports,
  contentErrorReportStatusEnum,
  contentErrorReportTargetKindEnum,
} from './feedback.schema.js';

describe('콘텐츠 오류 신고 schema', () => {
  it('신고 enum의 허용 값을 고정한다', () => {
    expect(contentErrorReportTargetKindEnum.enumValues).toEqual([
      'QUESTION',
      'VOCABULARY',
      'SENTENCE',
      'AUDIO',
      'CONCEPT',
    ]);
    expect(contentErrorReportCategoryEnum.enumValues).toHaveLength(6);
    expect(contentErrorReportStatusEnum.enumValues).toEqual([
      'OPEN',
      'IN_PROGRESS',
      'RESOLVED',
      'REJECTED',
    ]);
    expect(contentErrorReportHistoryActionEnum.enumValues).toEqual([
      'SUBMITTED',
      'STATUS_CHANGED',
      'ASSIGNEE_CHANGED',
    ]);
  });

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
    expect(
      report.columns
        .find(({ name }) => name === 'canonical_reference')
        ?.getSQLType(),
    ).toBe('jsonb');
    expect(
      report.columns.find(({ name }) => name === 'snapshot')?.getSQLType(),
    ).toBe('jsonb');
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

  it('신고 사용자 FK는 RESTRICT이고 이력 소유 FK만 CASCADE다', () => {
    const summarize = (
      table: typeof contentErrorReports | typeof contentErrorReportHistory,
    ) =>
      getTableConfig(table).foreignKeys.map((foreignKey) => {
        const reference = foreignKey.reference();
        return {
          columns: reference.columns.map(({ name }) => name),
          target: getTableName(reference.foreignTable),
          onDelete: foreignKey.onDelete,
        };
      });
    expect(summarize(contentErrorReports)).toEqual(
      expect.arrayContaining([
        {
          columns: ['reporter_user_id'],
          target: 'users',
          onDelete: 'restrict',
        },
        {
          columns: ['assignee_user_id'],
          target: 'users',
          onDelete: 'restrict',
        },
      ]),
    );
    expect(summarize(contentErrorReportHistory)).toEqual(
      expect.arrayContaining([
        {
          columns: ['report_id'],
          target: 'content_error_reports',
          onDelete: 'cascade',
        },
        { columns: ['actor_user_id'], target: 'users', onDelete: 'restrict' },
      ]),
    );
  });

  it('stable page index와 action별 nullable 조합 check를 둔다', () => {
    const indexes = getTableConfig(contentErrorReports).indexes.map(
      (index) => ({
        name: index.config.name,
        columns: index.config.columns.map((column) =>
          'name' in column ? column.name : null,
        ),
      }),
    );
    expect(indexes).toContainEqual({
      name: 'content_error_reports_assignee_status_page_idx',
      columns: ['assignee_user_id', 'status', 'created_at', 'id'],
    });
    expect(indexes).toContainEqual({
      name: 'content_error_reports_target_page_idx',
      columns: ['target_kind', 'created_at', 'id'],
    });
    expect(
      getTableConfig(contentErrorReportHistory).checks.map(({ name }) => name),
    ).toContain('content_error_report_history_action_payload');
  });
});
