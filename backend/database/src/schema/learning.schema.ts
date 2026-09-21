/** 학습자의 append-only 답안과 저장 문제·어휘 연결을 저장한다 */

import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';

import { vocabularies } from './vocabulary.schema.js';

/** 사용자가 저장한 공용 어휘의 중복 없는 연결 */
export const savedVocabularies = pgTable(
  'saved_vocabularies',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'saved_vocabularies_pk',
      columns: [table.userId, table.vocabularyId],
    }),
    index('saved_vocabularies_vocabulary_id_idx').on(table.vocabularyId),
  ],
);

/** 사용자가 이름으로 구분해 소유하는 어휘 모음 */
export const wordbooks = pgTable(
  'wordbooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('wordbooks_user_name_unique').on(table.userId, table.name),
  ],
);

/** 공용 어휘를 복제하지 않고 여러 단어장에 연결하는 membership */
export const wordbookItems = pgTable(
  'wordbook_items',
  {
    wordbookId: uuid('wordbook_id')
      .references(() => wordbooks.id, { onDelete: 'cascade' })
      .notNull(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'wordbook_items_pk',
      columns: [table.wordbookId, table.vocabularyId],
    }),
    index('wordbook_items_vocabulary_id_idx').on(table.vocabularyId),
    index('wordbook_items_page_idx').on(
      table.wordbookId,
      table.addedAt.desc(),
      table.vocabularyId.asc(),
    ),
  ],
);
