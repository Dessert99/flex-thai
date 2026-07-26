/** 콘텐츠 오류 신고와 append-only 관리자 처리 이력을 저장한다 */
import type {
  ContentErrorReportCanonicalReference,
  ContentErrorReportSnapshot,
} from '@flex-thia/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';

/** 콘텐츠 오류 신고 대상 종류 enum */
export const contentErrorReportTargetKindEnum = pgEnum(
  'content_error_report_target_kind',
  ['QUESTION', 'VOCABULARY', 'SENTENCE', 'AUDIO', 'CONCEPT'],
);
/** 콘텐츠 오류 신고 분류 enum */
export const contentErrorReportCategoryEnum = pgEnum(
  'content_error_report_category',
  [
    'MEANING_TRANSLATION',
    'PRONUNCIATION_TONE',
    'AUDIO',
    'ANSWER_EXPLANATION',
    'TOKENIZATION',
    'OTHER',
  ],
);
/** 콘텐츠 오류 신고 처리 상태 enum */
export const contentErrorReportStatusEnum = pgEnum(
  'content_error_report_status',
  ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'],
);
/** 콘텐츠 오류 신고 처리 이력 행동 enum */
export const contentErrorReportHistoryActionEnum = pgEnum(
  'content_error_report_history_action',
  ['SUBMITTED', 'STATUS_CHANGED', 'ASSIGNEE_CHANGED'],
);

/** 중복을 허용하며 immutable target 문맥을 보존하는 오류 신고 */
export const contentErrorReports = pgTable(
  'content_error_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reporterUserId: uuid('reporter_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    targetKind: contentErrorReportTargetKindEnum('target_kind').notNull(),
    category: contentErrorReportCategoryEnum('category').notNull(),
    status: contentErrorReportStatusEnum('status').default('OPEN').notNull(),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    description: varchar('description', { length: 1000 }),
    canonicalReference: jsonb('canonical_reference')
      .$type<ContentErrorReportCanonicalReference>()
      .notNull(),
    snapshot: jsonb('snapshot').$type<ContentErrorReportSnapshot>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('content_error_reports_status_page_idx').on(
      table.status,
      table.createdAt.desc(),
      table.id.asc(),
    ),
    index('content_error_reports_assignee_status_page_idx').on(
      table.assigneeUserId,
      table.status,
      table.createdAt.desc(),
      table.id.asc(),
    ),
    index('content_error_reports_target_page_idx').on(
      table.targetKind,
      table.createdAt.desc(),
      table.id.asc(),
    ),
  ],
);

/** 신고 생성과 관리자 변경을 append-only로 보존한다 */
export const contentErrorReportHistory = pgTable(
  'content_error_report_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: uuid('report_id')
      .references(() => contentErrorReports.id, { onDelete: 'cascade' })
      .notNull(),
    actorUserId: uuid('actor_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    action: contentErrorReportHistoryActionEnum('action').notNull(),
    fromStatus: contentErrorReportStatusEnum('from_status'),
    toStatus: contentErrorReportStatusEnum('to_status'),
    fromAssigneeUserId: uuid('from_assignee_user_id').references(
      () => users.id,
      { onDelete: 'restrict' },
    ),
    toAssigneeUserId: uuid('to_assignee_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('content_error_report_history_report_time_idx').on(
      table.reportId,
      table.createdAt.asc(),
      table.id.asc(),
    ),
    check(
      'content_error_report_history_action_payload',
      sql`
        (
          ${table.action} = 'SUBMITTED'
          and ${table.fromStatus} is null
          and ${table.toStatus} is null
          and ${table.fromAssigneeUserId} is null
          and ${table.toAssigneeUserId} is null
        )
        or (
          ${table.action} = 'STATUS_CHANGED'
          and ${table.fromStatus} is not null
          and ${table.toStatus} is not null
          and ${table.fromStatus} <> ${table.toStatus}
          and ${table.fromAssigneeUserId} is null
          and ${table.toAssigneeUserId} is null
        )
        or (
          ${table.action} = 'ASSIGNEE_CHANGED'
          and ${table.fromStatus} is null
          and ${table.toStatus} is null
          and ${table.fromAssigneeUserId} is distinct from ${table.toAssigneeUserId}
          and (${table.fromAssigneeUserId} is not null or ${table.toAssigneeUserId} is not null)
        )
      `,
    ),
  ],
);
