/** 공용 어휘의 뜻·발음과 동일 어휘 소유 관계를 저장한다 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mediaAssets } from './media.schema.js';

/** 공용 어휘 종류 */
export const vocabularyKindEnum = pgEnum('vocabulary_kind', [
  'WORD',
  'EXPRESSION',
]);

/** 공용 어휘 공개 상태 */
export const vocabularyStatusEnum = pgEnum('vocabulary_status', [
  'DRAFT',
  'PUBLISHED',
  'HIDDEN',
]);

/** 정확 중복을 정규화 표기로 차단하는 공용 어휘 */
export const vocabularies = pgTable(
  'vocabularies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    thai: text('thai').notNull(),
    normalizedThai: text('normalized_thai').notNull(),
    kind: vocabularyKindEnum('kind').notNull(),
    status: vocabularyStatusEnum('status').default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vocabularies_normalized_thai_unique').on(table.normalizedThai),
  ],
);

/** 공용 어휘의 한국어 뜻 */
export const vocabularyMeanings = pgTable(
  'vocabulary_meanings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    meaningKo: text('meaning_ko').notNull(),
    partOfSpeech: text('part_of_speech').notNull(),
    difficulty: integer('difficulty'),
    contextNote: text('context_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vocabulary_meanings_id_vocabulary_unique').on(
      table.id,
      table.vocabularyId,
    ),
    check(
      'vocabulary_meanings_difficulty_range',
      sql`${table.difficulty} is null or ${table.difficulty} between 1 and 5`,
    ),
  ],
);

/** 공용 어휘의 한국어 발음·성조·준비 음성 */
export const vocabularyPronunciations = pgTable(
  'vocabulary_pronunciations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    pronunciationKo: text('pronunciation_ko').notNull(),
    toneMarks: text('tone_marks').notNull(),
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vocabulary_pronunciations_id_vocabulary_unique').on(
      table.id,
      table.vocabularyId,
    ),
  ],
);

/** 한 어휘 안의 뜻과 발음 다대다 연결 */
export const vocabularyMeaningPronunciations = pgTable(
  'vocabulary_meaning_pronunciations',
  {
    vocabularyId: uuid('vocabulary_id').notNull(),
    meaningId: uuid('meaning_id').notNull(),
    pronunciationId: uuid('pronunciation_id').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'vocabulary_meaning_pronunciations_pk',
      columns: [table.meaningId, table.pronunciationId],
    }),
    foreignKey({
      name: 'vocabulary_meaning_pronunciations_meaning_fk',
      columns: [table.meaningId, table.vocabularyId],
      foreignColumns: [vocabularyMeanings.id, vocabularyMeanings.vocabularyId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'vocabulary_meaning_pronunciations_pronunciation_fk',
      columns: [table.pronunciationId, table.vocabularyId],
      foreignColumns: [
        vocabularyPronunciations.id,
        vocabularyPronunciations.vocabularyId,
      ],
    }).onDelete('restrict'),
  ],
);
