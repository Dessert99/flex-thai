/** 콘텐츠 제작과 TTS queue handoff를 durable하게 보존하는 공유 outbox schema */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** 서로 payload를 해석하지 않는 비동기 실행 destination */
export const asyncDispatchPayloadKindEnum = pgEnum(
  'async_dispatch_payload_kind',
  ['CONTENT_PRODUCTION', 'TTS'],
);

/** queue 수락 전까지 실행 intent와 lease·재시도 상태를 보존한다 */
export const asyncDispatchOutbox = pgTable(
  'async_dispatch_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    payloadKind: asyncDispatchPayloadKindEnum('payload_kind').notNull(),
    jobId: uuid('job_id').notNull(),
    attempt: integer('attempt').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    deliveryAttempts: integer('delivery_attempts').default(0).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('async_dispatch_outbox_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
    uniqueIndex('async_dispatch_outbox_execution_unique').on(
      table.payloadKind,
      table.jobId,
      table.attempt,
    ),
    index('async_dispatch_outbox_claim_idx').on(
      table.payloadKind,
      table.deliveredAt,
      table.availableAt,
      table.leaseExpiresAt,
    ),
    check(
      'async_dispatch_outbox_attempt_non_negative',
      sql`${table.attempt} >= 0`,
    ),
    check(
      'async_dispatch_outbox_delivery_attempts_non_negative',
      sql`${table.deliveryAttempts} >= 0`,
    ),
    check(
      'async_dispatch_outbox_lease_pair_consistent',
      sql`(${table.leaseOwner} is null) = (${table.leaseExpiresAt} is null)`,
    ),
  ],
);
