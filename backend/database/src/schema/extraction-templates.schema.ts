/** 추출 지시문은 실행 preset과 별도로 복사할 원문만 저장한다 */
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const extractionTemplates = pgTable(
  'extraction_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    description: text('description').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'extraction_templates_description_length',
      sql`char_length(trim(${table.description})) between 1 and 120`,
    ),
    check(
      'extraction_templates_body_length',
      sql`char_length(trim(${table.body})) between 1 and 20000`,
    ),
  ],
);
