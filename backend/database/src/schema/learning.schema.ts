/** 학습자의 append-only 답안과 저장 문제·어휘 연결을 저장한다 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';
import {
  questionOptions,
  questions,
  questionVersions,
} from './questions.schema.js';
import { vocabularies } from './vocabulary.schema.js';

/** 제출 당시 정답 여부를 이후 콘텐츠 상태와 무관하게 보존하는 원시 답안 */
export const questionAttempts = pgTable(
  'question_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    questionId: uuid('question_id').notNull(),
    questionVersionId: uuid('question_version_id').notNull(),
    attemptNo: integer('attempt_no').notNull(),
    selectedOptionId: uuid('selected_option_id').notNull(),
    clientAttemptId: uuid('client_attempt_id').notNull(),
    durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
    isCorrect: boolean('is_correct').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('question_attempts_user_question_attempt_unique').on(
      table.userId,
      table.questionId,
      table.attemptNo,
    ),
    uniqueIndex('question_attempts_user_client_attempt_unique').on(
      table.userId,
      table.clientAttemptId,
    ),
    index('question_attempts_user_submitted_at_idx').on(
      table.userId,
      table.submittedAt,
    ),
    foreignKey({
      name: 'question_attempts_question_version_fk',
      columns: [table.questionId, table.questionVersionId],
      foreignColumns: [questionVersions.questionId, questionVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'question_attempts_selected_option_fk',
      columns: [table.questionVersionId, table.selectedOptionId],
      foreignColumns: [questionOptions.questionVersionId, questionOptions.id],
    }).onDelete('restrict'),
    check('question_attempts_attempt_no_positive', sql`${table.attemptNo} > 0`),
    check(
      'question_attempts_duration_ms_safe_integer',
      sql`${table.durationMs} >= 0 and ${table.durationMs} <= 9007199254740991`,
    ),
  ],
);

/** 사용자가 저장한 문제의 중복 없는 연결 */
export const savedQuestions = pgTable(
  'saved_questions',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    questionId: uuid('question_id')
      .references(() => questions.id, { onDelete: 'restrict' })
      .notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'saved_questions_pk',
      columns: [table.userId, table.questionId],
    }),
    index('saved_questions_question_id_idx').on(table.questionId),
  ],
);

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
