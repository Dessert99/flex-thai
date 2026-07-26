/** 공용 어휘의 뜻·발음과 동일 어휘 소유 관계를 저장한다 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mediaAssets } from './media.schema.js';
import { users } from './identity.schema.js';

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
  'MERGED',
]);

/** 뜻 관계 종류 */
export const vocabularyMeaningRelationTypeEnum = pgEnum(
  'vocabulary_meaning_relation_type',
  ['SYNONYM', 'ANTONYM', 'RELATED'],
);

/** 뜻 관계 방향 */
export const vocabularyMeaningRelationDirectionEnum = pgEnum(
  'vocabulary_meaning_relation_direction',
  ['DIRECTED', 'BIDIRECTIONAL'],
);

/** 뜻 관계 검토 상태 */
export const vocabularyMeaningRelationStatusEnum = pgEnum(
  'vocabulary_meaning_relation_status',
  ['PENDING', 'PASSED', 'FAILED'],
);

/** 정확 중복을 정규화 표기로 차단하는 공용 어휘 */
export const vocabularies = pgTable(
  'vocabularies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    thai: text('thai').notNull(),
    normalizedThai: text('normalized_thai').notNull(),
    kind: vocabularyKindEnum('kind').notNull(),
    status: vocabularyStatusEnum('status').default('DRAFT').notNull(),
    mergedIntoVocabularyId: uuid('merged_into_vocabulary_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vocabularies_normalized_thai_unique').on(table.normalizedThai),
    unique('vocabularies_id_kind_unique').on(table.id, table.kind),
    foreignKey({
      name: 'vocabularies_merged_into_fk',
      columns: [table.mergedIntoVocabularyId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
    check(
      'vocabularies_merge_state_match',
      sql`(${table.status}::text = 'MERGED' and ${table.mergedIntoVocabularyId} is not null and ${table.mergedIntoVocabularyId} <> ${table.id}) or (${table.status}::text <> 'MERGED' and ${table.mergedIntoVocabularyId} is null)`,
    ),
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
    unique('vocabulary_meanings_id_vocabulary_unique').on(
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
    unique('vocabulary_pronunciations_id_vocabulary_unique').on(
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

/** 관리자 검토를 거쳐 학습자에게 공개되는 뜻 사이 관계 */
export const vocabularyMeaningRelations = pgTable(
  'vocabulary_meaning_relations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceMeaningId: uuid('source_meaning_id')
      .references(() => vocabularyMeanings.id, { onDelete: 'restrict' })
      .notNull(),
    targetMeaningId: uuid('target_meaning_id')
      .references(() => vocabularyMeanings.id, { onDelete: 'restrict' })
      .notNull(),
    type: vocabularyMeaningRelationTypeEnum('type').notNull(),
    direction: vocabularyMeaningRelationDirectionEnum('direction').notNull(),
    status: vocabularyMeaningRelationStatusEnum('status')
      .default('PENDING')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('vocabulary_meaning_relations_unique').on(
      table.sourceMeaningId,
      table.targetMeaningId,
      table.type,
      table.direction,
    ),
    check(
      'vocabulary_meaning_relations_not_self',
      sql`${table.sourceMeaningId} <> ${table.targetMeaningId}`,
    ),
    check(
      'vocabulary_meaning_relations_bidirectional_order',
      sql`${table.direction} <> 'BIDIRECTIONAL' or ${table.sourceMeaningId} < ${table.targetMeaningId}`,
    ),
  ],
);

/** 어휘 병합의 두 graph와 이동 수·감사 문맥을 append-only로 보존한다 */
export const vocabularyMergeHistory = pgTable(
  'vocabulary_merge_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceVocabularyId: uuid('source_vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    representativeVocabularyId: uuid('representative_vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    fingerprint: text('fingerprint').notNull(),
    sourceSnapshot: jsonb('source_snapshot')
      .$type<Record<string, unknown>>()
      .notNull(),
    representativeSnapshot: jsonb('representative_snapshot')
      .$type<Record<string, unknown>>()
      .notNull(),
    movedCounts: jsonb('moved_counts')
      .$type<Record<string, number>>()
      .notNull(),
    actorUserId: uuid('actor_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    requestId: text('request_id').notNull(),
    mergedAt: timestamp('merged_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'vocabulary_merge_history_distinct_vocabularies',
      sql`${table.sourceVocabularyId} <> ${table.representativeVocabularyId}`,
    ),
  ],
);
