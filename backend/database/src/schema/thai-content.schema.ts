/** 재사용 문장과 불변 버전의 토큰·표현 출현을 저장한다 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mediaAssets } from './media.schema.js';
import {
  vocabularies,
  vocabularyKindEnum,
  vocabularyMeanings,
  vocabularyPronunciations,
} from './vocabulary.schema.js';

/** 문장 토큰이 문제에서 맡는 역할 */
export const tokenOccurrenceRoleEnum = pgEnum('token_occurrence_role', [
  'TARGET',
  'REQUIRED',
  'SUPPORTING',
  'INSTRUCTION',
]);

/** 여러 문제 버전이 재사용할 문장의 논리 정체성 */
export const thaiSentences = pgTable('thai_sentences', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** 실제 표시 내용과 음성을 보존하는 문장 스냅샷 */
export const thaiSentenceVersions = pgTable(
  'thai_sentence_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sentenceId: uuid('sentence_id')
      .references(() => thaiSentences.id, { onDelete: 'restrict' })
      .notNull(),
    version: integer('version').notNull(),
    originalText: text('original_text').notNull(),
    translationKo: text('translation_ko').notNull(),
    pronunciationKo: text('pronunciation_ko').notNull(),
    toneMarks: text('tone_marks').notNull(),
    mediaAssetId: uuid('media_asset_id')
      .references(() => mediaAssets.id, { onDelete: 'restrict' })
      .notNull(),
    frozenAt: timestamp('frozen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('thai_sentence_versions_sentence_version_unique').on(
      table.sentenceId,
      table.version,
    ),
    check('thai_sentence_versions_version_positive', sql`${table.version} > 0`),
  ],
);

/** 문장 안 한 번의 토큰 출현과 선택된 공용 뜻·발음 */
export const tokenOccurrences = pgTable(
  'token_occurrences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sentenceVersionId: uuid('sentence_version_id')
      .references(() => thaiSentenceVersions.id, { onDelete: 'restrict' })
      .notNull(),
    position: integer('position').notNull(),
    surface: text('surface').notNull(),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    vocabularyId: uuid('vocabulary_id').notNull(),
    meaningId: uuid('meaning_id').notNull(),
    pronunciationId: uuid('pronunciation_id').notNull(),
    contextMeaningKo: text('context_meaning_ko').notNull(),
    role: tokenOccurrenceRoleEnum('role').notNull(),
  },
  (table) => [
    uniqueIndex('token_occurrences_sentence_position_unique').on(
      table.sentenceVersionId,
      table.position,
    ),
    foreignKey({
      name: 'token_occurrences_vocabulary_fk',
      columns: [table.vocabularyId],
      foreignColumns: [vocabularies.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'token_occurrences_meaning_vocabulary_fk',
      columns: [table.meaningId, table.vocabularyId],
      foreignColumns: [vocabularyMeanings.id, vocabularyMeanings.vocabularyId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'token_occurrences_pronunciation_vocabulary_fk',
      columns: [table.pronunciationId, table.vocabularyId],
      foreignColumns: [
        vocabularyPronunciations.id,
        vocabularyPronunciations.vocabularyId,
      ],
    }).onDelete('restrict'),
    check(
      'token_occurrences_position_nonnegative',
      sql`${table.position} >= 0`,
    ),
    check(
      'token_occurrences_offset_range',
      sql`${table.startOffset} >= 0 and ${table.endOffset} > ${table.startOffset}`,
    ),
  ],
);

/** 여러 토큰에 걸친 공용 표현과 대표 선택 결과 */
export const expressionOccurrences = pgTable(
  'expression_occurrences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sentenceVersionId: uuid('sentence_version_id')
      .references(() => thaiSentenceVersions.id, { onDelete: 'restrict' })
      .notNull(),
    startTokenIndex: integer('start_token_index').notNull(),
    endTokenIndex: integer('end_token_index').notNull(),
    vocabularyId: uuid('vocabulary_id').notNull(),
    vocabularyKind: vocabularyKindEnum('vocabulary_kind').notNull(),
    meaningId: uuid('meaning_id').notNull(),
    pronunciationId: uuid('pronunciation_id').notNull(),
    contextMeaningKo: text('context_meaning_ko').notNull(),
    representative: boolean('representative').default(false).notNull(),
  },
  (table) => [
    index('expression_occurrences_sentence_idx').on(table.sentenceVersionId),
    foreignKey({
      name: 'expression_occurrences_vocabulary_kind_fk',
      columns: [table.vocabularyId, table.vocabularyKind],
      foreignColumns: [vocabularies.id, vocabularies.kind],
    }).onDelete('restrict'),
    foreignKey({
      name: 'expression_occurrences_meaning_vocabulary_fk',
      columns: [table.meaningId, table.vocabularyId],
      foreignColumns: [vocabularyMeanings.id, vocabularyMeanings.vocabularyId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'expression_occurrences_pronunciation_vocabulary_fk',
      columns: [table.pronunciationId, table.vocabularyId],
      foreignColumns: [
        vocabularyPronunciations.id,
        vocabularyPronunciations.vocabularyId,
      ],
    }).onDelete('restrict'),
    check(
      'expression_occurrences_vocabulary_kind_expression',
      sql`${table.vocabularyKind} = 'EXPRESSION'`,
    ),
    check(
      'expression_occurrences_token_range',
      sql`${table.startTokenIndex} >= 0 and ${table.endTokenIndex} - ${table.startTokenIndex} >= 2`,
    ),
  ],
);
