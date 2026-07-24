/** 비동기 작업과 항목별 부분 실패, Provider 사용량을 저장한다 */
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';

/** 지원하는 초기 Job 종류 */
export const jobTypeEnum = pgEnum('job_type', [
  'VOCAB_IMPORT',
  'QUESTION_GENERATION',
]);

/** 지원하는 원본 형식 */
export const inputTypeEnum = pgEnum('input_type', ['TEXT', 'PDF', 'IMAGE']);

/** Job 전체 상태 */
export const jobStatusEnum = pgEnum('job_status', [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_FAILURES',
  'FAILED',
  'CANCELLED',
]);

/** 항목 단위 처리 상태 */
export const jobItemStatusEnum = pgEnum('job_item_status', [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'NEEDS_ATTENTION',
  'FAILED',
]);

/** S3 object 완료 검증 상태 */
export const uploadStatusEnum = pgEnum('upload_status', [
  'PENDING',
  'VERIFIED',
  'REJECTED',
]);

/** 사전 서명 정책과 실제 S3 object 검증 결과를 연결한다 */
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .references(() => users.id)
      .notNull(),
    inputType: inputTypeEnum('input_type').notNull(),
    objectKey: text('object_key').notNull(),
    declaredContentType: text('declared_content_type').notNull(),
    sizeBytes: integer('size_bytes'),
    status: uploadStatusEnum('status').default('PENDING').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('uploads_object_key_unique').on(table.objectKey)],
);

/** API 요청과 queue 실행을 연결하는 aggregate root */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestedBy: uuid('requested_by')
      .references(() => users.id)
      .notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    type: jobTypeEnum('type').notNull(),
    status: jobStatusEnum('status').default('QUEUED').notNull(),
    attempt: integer('attempt').default(0).notNull(),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('jobs_requester_client_request_unique').on(
      table.requestedBy,
      table.clientRequestId,
    ),
    index('jobs_status_created_at_idx').on(table.status, table.createdAt),
  ],
);

/** 파일 개수를 고정하지 않고 각 원본과 총 용량을 Job에 연결한다 */
export const jobInputs = pgTable('job_inputs', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id)
    .notNull(),
  uploadId: uuid('upload_id')
    .references(() => uploads.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** 한 항목 실패가 다른 항목을 막지 않게 상태를 분리한다 */
export const jobItems = pgTable('job_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id)
    .notNull(),
  status: jobItemStatusEnum('status').default('PENDING').notNull(),
  sourceRef: text('source_ref'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** 외부 Provider의 품질과 비용을 나중에 비교할 실행 기록 */
export const providerRuns = pgTable(
  'provider_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobItemId: uuid('job_item_id')
      .references(() => jobItems.id)
      .notNull(),
    operation: text('operation').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    attempt: integer('attempt').notNull(),
    usage: jsonb('usage').$type<Record<string, number>>().notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', {
      precision: 12,
      scale: 6,
    }).notNull(),
    success: boolean('success').notNull(),
    errorCode: text('error_code'),
    providerRequestId: text('provider_request_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('provider_runs_item_operation_attempt_unique').on(
      table.jobItemId,
      table.operation,
      table.attempt,
    ),
  ],
);
