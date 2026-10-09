import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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
    importanceWeight: integer('importance_weight').default(5).notNull(),
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
    check(
      'vocabularies_importance_weight_range',
      sql`${table.importanceWeight} between 1 and 10`,
    ),
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
