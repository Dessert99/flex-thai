/** 개념의 논리 정체성과 불변 버전·블록·예시를 저장한다 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { thaiSentenceVersions } from './thai-content.schema.js';

/** JSONB에 저장하는 개념 검증 문제 */
export interface StoredConceptValidationIssue {
  source: 'STRUCTURE' | 'REFERENCE' | 'EXTERNAL';
  path: string;
  code: string;
  evidenceKo: string;
}

/** 개념 영역 */
export const conceptCategoryEnum = pgEnum('concept_category', [
  'THAI_SCRIPT_PRONUNCIATION',
  'GRAMMAR',
]);

/** 논리 개념 공개 상태 */
export const conceptStatusEnum = pgEnum('concept_status', [
  'DRAFT',
  'PUBLISHED',
  'HIDDEN',
]);

/** 개념 버전 수명 상태 */
export const conceptVersionStatusEnum = pgEnum('concept_version_status', [
  'DRAFT',
  'PUBLISHED',
  'RETIRED',
]);

/** 개념 버전 검증 상태 */
export const conceptValidationStatusEnum = pgEnum('concept_validation_status', [
  'PENDING',
  'PASSED',
  'FAILED',
]);

/** 개념 화면의 블록 종류 */
export const conceptBlockKindEnum = pgEnum('concept_block_kind', [
  'EXPLANATION',
  'RULE_TABLE',
  'THAI_EXAMPLES',
]);

/** 같은 개념의 정체성과 현재 공개 버전을 관리한다 */
export const concepts = pgTable(
  'concepts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: conceptStatusEnum('status').default('DRAFT').notNull(),
    currentPublishedVersionId: uuid('current_published_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'concepts_current_published_version_fk',
      columns: [table.id, table.currentPublishedVersionId],
      foreignColumns: [conceptVersions.conceptId, conceptVersions.id],
    }).onDelete('restrict'),
  ],
);

/** 개념의 실제 본문과 검증·게시 snapshot을 보존한다 */
export const conceptVersions = pgTable(
  'concept_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conceptId: uuid('concept_id')
      .references((): AnyPgColumn => concepts.id, { onDelete: 'restrict' })
      .notNull(),
    version: integer('version').notNull(),
    revision: integer('revision').default(0).notNull(),
    category: conceptCategoryEnum('category').notNull(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    status: conceptVersionStatusEnum('status').default('DRAFT').notNull(),
    validationStatus: conceptValidationStatusEnum('validation_status')
      .default('PENDING')
      .notNull(),
    validationIssues: jsonb('validation_issues')
      .$type<StoredConceptValidationIssue[]>()
      .default([])
      .notNull(),
    validatedRevision: integer('validated_revision'),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('concept_versions_concept_version_unique').on(
      table.conceptId,
      table.version,
    ),
    uniqueIndex('concept_versions_single_draft_unique')
      .on(table.conceptId)
      .where(sql`${table.status} = 'DRAFT'`),
    unique('concept_versions_concept_id_id_unique').on(
      table.conceptId,
      table.id,
    ),
    check('concept_versions_version_positive', sql`${table.version} > 0`),
    check('concept_versions_revision_nonnegative', sql`${table.revision} >= 0`),
    check('concept_versions_position_nonnegative', sql`${table.position} >= 0`),
    check(
      'concept_versions_validation_consistent',
      sql`(${table.validationStatus} = 'PENDING' and ${table.validatedRevision} is null and ${table.validatedAt} is null and jsonb_array_length(${table.validationIssues}) = 0)
        or (${table.validationStatus} = 'PASSED' and ${table.validatedRevision} is not null and ${table.validatedAt} is not null and jsonb_array_length(${table.validationIssues}) = 0)
        or (${table.validationStatus} = 'FAILED' and ${table.validatedRevision} is not null and ${table.validatedAt} is not null and jsonb_array_length(${table.validationIssues}) > 0)`,
    ),
    check(
      'concept_versions_publication_consistent',
      sql`(${table.status} = 'DRAFT' and ${table.publishedAt} is null)
        or (${table.status} in ('PUBLISHED', 'RETIRED') and ${table.publishedAt} is not null)`,
    ),
  ],
);

/** 개념 버전의 의미 단위와 종류별 payload를 저장한다 */
export const conceptBlocks = pgTable(
  'concept_blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conceptVersionId: uuid('concept_version_id')
      .references(() => conceptVersions.id, { onDelete: 'restrict' })
      .notNull(),
    kind: conceptBlockKindEnum('kind').notNull(),
    position: integer('position').notNull(),
    heading: text('heading').notNull(),
    paragraphs: jsonb('paragraphs').$type<string[]>(),
    tableHeaders: jsonb('table_headers').$type<string[]>(),
    tableRows: jsonb('table_rows').$type<string[][]>(),
  },
  (table) => [
    uniqueIndex('concept_blocks_version_position_unique').on(
      table.conceptVersionId,
      table.position,
    ),
    check('concept_blocks_position_nonnegative', sql`${table.position} >= 0`),
  ],
);

/** 예시 블록과 기존 불변 태국어 문장 버전을 연결한다 */
export const conceptBlockExamples = pgTable(
  'concept_block_examples',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blockId: uuid('block_id')
      .references(() => conceptBlocks.id, { onDelete: 'restrict' })
      .notNull(),
    position: integer('position').notNull(),
    sentenceVersionId: uuid('sentence_version_id')
      .references(() => thaiSentenceVersions.id, { onDelete: 'restrict' })
      .notNull(),
    noteKo: text('note_ko'),
  },
  (table) => [
    uniqueIndex('concept_block_examples_block_position_unique').on(
      table.blockId,
      table.position,
    ),
    uniqueIndex('concept_block_examples_block_sentence_unique').on(
      table.blockId,
      table.sentenceVersionId,
    ),
    check(
      'concept_block_examples_position_nonnegative',
      sql`${table.position} >= 0`,
    ),
  ],
);
