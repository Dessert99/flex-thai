/** 단어 연습의 materialized 세션·문항 snapshot과 append-only 답안을 저장한다 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';
import { wordbooks } from './learning.schema.js';
import { mediaAssets } from './media.schema.js';
import {
  vocabularies,
  vocabularyMeanings,
  vocabularyPronunciations,
} from './vocabulary.schema.js';

/** 단어 연습 출처 */
export const vocabularyPracticeSourceTypeEnum = pgEnum(
  'vocabulary_practice_source_type',
  ['SEARCH_SELECTION', 'WORDBOOK'],
);

/** 단어 연습 출제 방식 */
export const vocabularyPracticeModeEnum = pgEnum('vocabulary_practice_mode', [
  'THAI_TO_MEANING',
  'MEANING_TO_THAI',
  'AUDIO_TO_THAI',
  'AUDIO_TO_MEANING',
]);

/** 단어 연습 출제 순서 */
export const vocabularyPracticeOrderEnum = pgEnum('vocabulary_practice_order', [
  'RANDOM',
  'SOURCE',
]);

/** 단어 연습 세션 상태 */
export const vocabularyPracticeStatusEnum = pgEnum(
  'vocabulary_practice_status',
  ['ACTIVE', 'COMPLETED'],
);

type PracticeOptionJson = Array<{ id: string; label: string }>;
type PracticeCardJson = {
  id: string;
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  meanings: Array<{
    id: string;
    meaningKo: string;
    partOfSpeech: string;
    difficulty: number | null;
    contextNote: string | null;
  }>;
  pronunciations: Array<{
    id: string;
    pronunciationKo: string;
    toneMarks: string;
    mediaAssetId: string;
    storageKey: string;
  }>;
  meaningPronunciations: Array<{
    meaningId: string;
    pronunciationId: string;
  }>;
};

/** source 설정과 완료 시각을 보존하는 단어 연습 세션 */
export const vocabularyPracticeSessions = pgTable(
  'vocabulary_practice_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    sourceType: vocabularyPracticeSourceTypeEnum('source_type').notNull(),
    sourceWordbookId: uuid('source_wordbook_id').references(
      () => wordbooks.id,
      { onDelete: 'set null' },
    ),
    sourceLabel: text('source_label').notNull(),
    modes: vocabularyPracticeModeEnum('modes').array().notNull(),
    requestedQuestionCount: integer('requested_question_count'),
    questionOrder: vocabularyPracticeOrderEnum('question_order').notNull(),
    status: vocabularyPracticeStatusEnum('status').default('ACTIVE').notNull(),
    questionCount: integer('question_count').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('vocabulary_practice_sessions_id_user_unique').on(
      table.id,
      table.userId,
    ),
    check(
      'vocabulary_practice_sessions_question_count_range',
      sql`${table.questionCount} between 1 and 100`,
    ),
    check(
      'vocabulary_practice_sessions_requested_count_valid',
      sql`${table.requestedQuestionCount} is null or ${table.requestedQuestionCount} in (10, 20)`,
    ),
    check(
      'vocabulary_practice_sessions_modes_nonempty',
      sql`cardinality(${table.modes}) between 1 and 4`,
    ),
    check(
      'vocabulary_practice_sessions_status_completed_at_match',
      sql`(${table.status} = 'ACTIVE' and ${table.completedAt} is null) or (${table.status} = 'COMPLETED' and ${table.completedAt} is not null)`,
    ),
    check(
      'vocabulary_practice_sessions_source_match',
      // WORDBOOK null은 ON DELETE SET NULL로 남은 과거 snapshot만 허용한다.
      sql`(${table.sourceType} = 'SEARCH_SELECTION' and ${table.sourceWordbookId} is null) or ${table.sourceType} = 'WORDBOOK'`,
    ),
  ],
);

/** 출제 당시 prompt·선택지·정답·카드를 보존하는 단어 연습 문항 */
export const vocabularyPracticeQuestions = pgTable(
  'vocabulary_practice_questions',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .references(() => vocabularyPracticeSessions.id, {
        onDelete: 'restrict',
      })
      .notNull(),
    position: integer('position').notNull(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    meaningId: uuid('meaning_id').notNull(),
    pronunciationId: uuid('pronunciation_id'),
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    mode: vocabularyPracticeModeEnum('mode').notNull(),
    promptText: text('prompt_text'),
    audioStorageKey: text('audio_storage_key'),
    thaiSnapshot: text('thai_snapshot').notNull(),
    meaningKoSnapshot: text('meaning_ko_snapshot').notNull(),
    pronunciationKoSnapshot: text('pronunciation_ko_snapshot'),
    toneMarksSnapshot: text('tone_marks_snapshot'),
    options: jsonb('options').$type<PracticeOptionJson>().notNull(),
    correctOptionId: uuid('correct_option_id').notNull(),
    cardSnapshot: jsonb('card_snapshot').$type<PracticeCardJson>().notNull(),
  },
  (table) => [
    uniqueIndex('vocabulary_practice_questions_session_position_unique').on(
      table.sessionId,
      table.position,
    ),
    uniqueIndex('vocabulary_practice_questions_session_id_unique').on(
      table.sessionId,
      table.id,
    ),
    foreignKey({
      name: 'vocabulary_practice_questions_meaning_vocabulary_fk',
      columns: [table.meaningId, table.vocabularyId],
      foreignColumns: [vocabularyMeanings.id, vocabularyMeanings.vocabularyId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'vocabulary_practice_questions_pronunciation_vocabulary_fk',
      columns: [table.pronunciationId, table.vocabularyId],
      foreignColumns: [
        vocabularyPronunciations.id,
        vocabularyPronunciations.vocabularyId,
      ],
    }).onDelete('restrict'),
    check(
      'vocabulary_practice_questions_position_positive',
      sql`${table.position} > 0`,
    ),
    check(
      'vocabulary_practice_questions_audio_fields_match',
      sql`(${table.mode} in ('AUDIO_TO_THAI', 'AUDIO_TO_MEANING') and ${table.pronunciationId} is not null and ${table.mediaAssetId} is not null and ${table.audioStorageKey} is not null and ${table.promptText} is null) or (${table.mode} not in ('AUDIO_TO_THAI', 'AUDIO_TO_MEANING') and ${table.pronunciationId} is null and ${table.mediaAssetId} is null and ${table.audioStorageKey} is null and ${table.promptText} is not null)`,
    ),
  ],
);

/** 답 제출 당시 선택과 정오를 중복 없이 append-only로 보존한다 */
export const vocabularyPracticeAnswers = pgTable(
  'vocabulary_practice_answers',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id').notNull(),
    questionId: uuid('question_id').notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    clientAnswerId: uuid('client_answer_id').notNull(),
    selectedOptionId: uuid('selected_option_id').notNull(),
    selectedLabelSnapshot: text('selected_label_snapshot').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('vocabulary_practice_answers_session_question_unique').on(
      table.sessionId,
      table.questionId,
    ),
    uniqueIndex('vocabulary_practice_answers_user_client_unique').on(
      table.userId,
      table.clientAnswerId,
    ),
    foreignKey({
      name: 'vocabulary_practice_answers_question_session_fk',
      columns: [table.sessionId, table.questionId],
      foreignColumns: [
        vocabularyPracticeQuestions.sessionId,
        vocabularyPracticeQuestions.id,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'vocabulary_practice_answers_session_user_fk',
      columns: [table.sessionId, table.userId],
      foreignColumns: [
        vocabularyPracticeSessions.id,
        vocabularyPracticeSessions.userId,
      ],
    }).onDelete('restrict'),
  ],
);
