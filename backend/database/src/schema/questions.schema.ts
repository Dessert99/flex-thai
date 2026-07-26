/** 문제 유형과 불변 문제 버전의 블록·선택지 게시 구조를 저장한다 */
import type { QuestionValidationIssue } from '@flex-thia/domain';
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
  type AnyPgColumn,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { thaiSentenceVersions } from './thai-content.schema.js';

/** 문제의 읽기·듣기 시험 영역 */
export const questionSkillEnum = pgEnum('question_skill', [
  'READING',
  'LISTENING',
]);

/** 선택형 문제의 화면 구조 */
export const questionTemplateEnum = pgEnum('question_template', [
  'STANDARD_CHOICE',
  'PASSAGE_CHOICE',
  'DIALOGUE_CHOICE',
  'INLINE_SPAN_CHOICE',
]);

/** 논리 문제의 학습자 노출 상태 */
export const questionStatusEnum = pgEnum('question_status', [
  'DRAFT',
  'PUBLISHED',
  'HIDDEN',
]);

/** 불변 문제 버전의 게시 수명 상태 */
export const questionVersionStatusEnum = pgEnum('question_version_status', [
  'DRAFT',
  'PUBLISHED',
  'RETIRED',
  'INVALIDATED',
]);

/** 문제 버전의 최신 게시 검증 상태 */
export const questionValidationStatusEnum = pgEnum(
  'question_validation_status',
  ['PENDING', 'PASSED', 'FAILED'],
);

/** 문제 화면을 순서대로 구성하는 블록 종류 */
export const questionBlockKindEnum = pgEnum('question_block_kind', [
  'INSTRUCTION',
  'PASSAGE',
  'DIALOGUE',
  'QUESTION',
  'EXPLANATION',
]);

/** 문제 문장의 텍스트·음성 초기 표시 방식 */
export const questionDisplayModeEnum = pgEnum('question_display_mode', [
  'TEXT',
  'AUDIO',
  'TEXT_AND_AUDIO',
  'AUDIO_THEN_REVEAL',
]);

/** 세부 출제 유형의 논리적 정체성과 시험 영역 */
export const questionTypes = pgTable(
  'question_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    skill: questionSkillEnum('skill').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('question_types_slug_unique').on(table.slug)],
);

/** 유형별 템플릿과 선택지 수·결정 규칙을 버전으로 고정한다 */
export const questionTypeVersions = pgTable(
  'question_type_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionTypeId: uuid('question_type_id')
      .references(() => questionTypes.id, { onDelete: 'restrict' })
      .notNull(),
    version: integer('version').notNull(),
    template: questionTemplateEnum('template').notNull(),
    optionCount: integer('option_count').notNull(),
    decisionRules: jsonb('decision_rules')
      .$type<Record<string, unknown>>()
      .notNull(),
  },
  (table) => [
    uniqueIndex('question_type_versions_type_version_unique').on(
      table.questionTypeId,
      table.version,
    ),
    check('question_type_versions_version_positive', sql`${table.version} > 0`),
    check(
      'question_type_versions_option_count_positive',
      sql`${table.optionCount} > 0`,
    ),
  ],
);

/** 같은 문제의 정체성과 현재 학습자에게 공개할 버전을 관리한다 */
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: questionStatusEnum('status').default('DRAFT').notNull(),
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
      name: 'questions_current_published_version_fk',
      columns: [table.id, table.currentPublishedVersionId],
      foreignColumns: [questionVersions.questionId, questionVersions.id],
    }).onDelete('restrict'),
  ],
);

/** 실제 출제 내용과 검증·게시 결과를 불변 버전으로 보존한다 */
export const questionVersions = pgTable(
  'question_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .references((): AnyPgColumn => questions.id, { onDelete: 'restrict' })
      .notNull(),
    version: integer('version').notNull(),
    typeVersionId: uuid('type_version_id')
      .references(() => questionTypeVersions.id, { onDelete: 'restrict' })
      .notNull(),
    difficulty: integer('difficulty').notNull(),
    status: questionVersionStatusEnum('status').default('DRAFT').notNull(),
    validationStatus: questionValidationStatusEnum('validation_status')
      .default('PENDING')
      .notNull(),
    validationIssues: jsonb('validation_issues')
      .$type<QuestionValidationIssue[]>()
      .default([])
      .notNull(),
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
    uniqueIndex('question_versions_question_version_unique').on(
      table.questionId,
      table.version,
    ),
    unique('question_versions_question_id_id_unique').on(
      table.questionId,
      table.id,
    ),
    check('question_versions_version_positive', sql`${table.version} > 0`),
    check(
      'question_versions_difficulty_range',
      sql`${table.difficulty} between 1 and 5`,
    ),
  ],
);

/** 문제 버전 화면의 의미 단위와 표시 순서를 저장한다 */
export const questionBlocks = pgTable(
  'question_blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionVersionId: uuid('question_version_id')
      .references(() => questionVersions.id, { onDelete: 'restrict' })
      .notNull(),
    kind: questionBlockKindEnum('kind').notNull(),
    displayMode: questionDisplayModeEnum('display_mode').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    uniqueIndex('question_blocks_version_position_unique').on(
      table.questionVersionId,
      table.position,
    ),
    check('question_blocks_position_nonnegative', sql`${table.position} >= 0`),
  ],
);

/** 블록 안에서 재사용 문장 버전과 선택적 화자 순서를 연결한다 */
export const questionBlockSentences = pgTable(
  'question_block_sentences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blockId: uuid('block_id')
      .references(() => questionBlocks.id, { onDelete: 'restrict' })
      .notNull(),
    sentenceVersionId: uuid('sentence_version_id')
      .references(() => thaiSentenceVersions.id, { onDelete: 'restrict' })
      .notNull(),
    position: integer('position').notNull(),
    speaker: text('speaker'),
  },
  (table) => [
    uniqueIndex('question_block_sentences_block_position_unique').on(
      table.blockId,
      table.position,
    ),
    check(
      'question_block_sentences_position_nonnegative',
      sql`${table.position} >= 0`,
    ),
  ],
);

/** 문제 버전의 선택지 문장·순서와 비공개 정답 여부를 저장한다 */
export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionVersionId: uuid('question_version_id')
      .references(() => questionVersions.id, { onDelete: 'restrict' })
      .notNull(),
    sentenceVersionId: uuid('sentence_version_id')
      .references(() => thaiSentenceVersions.id, { onDelete: 'restrict' })
      .notNull(),
    spanSentenceVersionId: uuid('span_sentence_version_id').references(
      () => thaiSentenceVersions.id,
      { onDelete: 'restrict' },
    ),
    spanStartTokenIndex: integer('span_start_token_index'),
    spanEndTokenIndex: integer('span_end_token_index'),
    position: integer('position').notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
  },
  (table) => [
    uniqueIndex('question_options_version_position_unique').on(
      table.questionVersionId,
      table.position,
    ),
    unique('question_options_question_version_id_id_unique').on(
      table.questionVersionId,
      table.id,
    ),
    uniqueIndex('question_options_one_correct_per_version')
      .on(table.questionVersionId)
      .where(sql`${table.isCorrect} = true`),
    check('question_options_position_nonnegative', sql`${table.position} >= 0`),
    check(
      'question_options_span_all_or_none',
      sql`(${table.spanSentenceVersionId} is null and ${table.spanStartTokenIndex} is null and ${table.spanEndTokenIndex} is null)
        or (${table.spanSentenceVersionId} is not null and ${table.spanStartTokenIndex} is not null and ${table.spanEndTokenIndex} is not null)`,
    ),
    check(
      'question_options_span_range',
      sql`${table.spanStartTokenIndex} is null or (${table.spanStartTokenIndex} >= 0 and ${table.spanEndTokenIndex} > ${table.spanStartTokenIndex})`,
    ),
  ],
);
