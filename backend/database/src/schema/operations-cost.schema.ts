/** 월간 AI·TTS 비용 경고 기준과 최신 idempotent 요청을 저장한다 */
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';

/** 비용 경고 설정 singleton */
export const operationsCostSettings = pgTable(
  'operations_cost_settings',
  {
    id: integer('id').primaryKey().default(1),
    currency: text('currency').default('USD').notNull(),
    warningUsd: numeric('warning_usd', { precision: 18, scale: 6 })
      .default('15.000000')
      .notNull(),
    criticalUsd: numeric('critical_usd', { precision: 18, scale: 6 })
      .default('24.000000')
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    lastRequestId: uuid('last_request_id'),
    lastRequestFingerprint: text('last_request_fingerprint'),
  },
  (table) => [
    check('operations_cost_settings_singleton', sql`${table.id} = 1`),
    check(
      'operations_cost_settings_currency_usd',
      sql`${table.currency} = 'USD'`,
    ),
    check(
      'operations_cost_settings_threshold_order',
      sql`${table.warningUsd} > 0 and ${table.warningUsd} < ${table.criticalUsd}`,
    ),
  ],
);
