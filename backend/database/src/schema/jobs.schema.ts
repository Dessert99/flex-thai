/** 비동기 작업과 항목별 부분 실패, Provider 사용량을 저장한다 */
import {
  boolean,
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

/** 지원하는 원본 형식 */
export const inputTypeEnum = pgEnum('input_type', ['TEXT', 'PDF', 'IMAGE']);

/** S3 object 완료 검증 상태 */
export const uploadStatusEnum = pgEnum('upload_status', [
  'PENDING',
  'VERIFIED',
  'REJECTED',
]);

/** 외부 provider 실행의 비용 안전한 수명 */
export const providerRunStatusEnum = pgEnum('provider_run_status', [
  'STARTED',
  'SUCCEEDED',
  'FAILED',
  'OUTCOME_UNKNOWN',
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

/** 외부 Provider의 품질과 비용을 나중에 비교할 실행 기록 */
export const providerRuns = pgTable('provider_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  operation: text('operation').notNull(),
  sequence: integer('sequence').default(0).notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').default('legacy').notNull(),
  itemLeaseToken: text('item_lease_token').default('legacy').notNull(),
  attempt: integer('attempt').notNull(),
  status: providerRunStatusEnum('status').default('STARTED').notNull(),
  usage: jsonb('usage').$type<Record<string, number>>().default({}).notNull(),
  estimatedCostUsd: numeric('estimated_cost_usd', {
    precision: 12,
    scale: 6,
  })
    .default('0')
    .notNull(),
  success: boolean('success'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  retryable: boolean('retryable').default(false).notNull(),
  errorCode: text('error_code'),
  providerRequestId: text('provider_request_id'),
  startedAt: timestamp('started_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});
