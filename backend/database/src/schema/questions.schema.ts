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

/** FLEX 시험의 고정 7대 문제 분류 */
export const questionMajorCategoryEnum = pgEnum('question_major_category', [
  'LISTENING_RESPONSE',
  'LISTENING_DIALOGUE',
  'LISTENING_PASSAGE',
  'READING_VOCABULARY_GRAMMAR',
  'READING_SYNONYM_RELATION',
  'READING_ERROR_IDENTIFICATION',
  'READING_PASSAGE',
]);

/** 세부 문제 유형 버전의 설정 수명 상태 */
export const questionTypeVersionStatusEnum = pgEnum(
  'question_type_version_status',
  ['DRAFT', 'ACTIVE', 'RETIRED'],
);

/** 주제와 태그의 신규 선택 가능 상태 */
export const questionTaxonomyStatusEnum = pgEnum('question_taxonomy_status', [
  'ACTIVE',
  'ARCHIVED',
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

/** 문제 버전이 하나씩 참조하는 불변 주제 사전 */
export const questionTopics = pgTable(
  'question_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: questionTaxonomyStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('question_topics_slug_unique').on(table.slug)],
);

/** 문제 버전에 여러 개 연결할 수 있는 불변 태그 사전 */
export const questionTags = pgTable(
  'question_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: questionTaxonomyStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('question_tags_slug_unique').on(table.slug)],
);

/** 세부 출제 유형의 논리적 정체성과 시험 영역 */
export const questionTypes = pgTable(
  'question_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    skill: questionSkillEnum('skill').notNull(),
    majorCategory: questionMajorCategoryEnum('major_category').notNull(),
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
    status: questionTypeVersionStatusEnum('status').default('DRAFT').notNull(),
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
    uniqueIndex('question_type_versions_one_active_per_type')
      .on(table.questionTypeId)
      .where(sql`${table.status} = 'ACTIVE'`),
  ],
);

/** 문제 유형 버전의 1~5 난이도 판정 기준 */
export const questionTypeDifficultyCriteria = pgTable(
  'question_type_difficulty_criteria',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    typeVersionId: uuid('type_version_id')
      .references(() => questionTypeVersions.id, { onDelete: 'restrict' })
      .notNull(),
    difficulty: integer('difficulty').notNull(),
    criteria: text('criteria').notNull(),
  },
  (table) => [
    uniqueIndex('question_type_difficulty_criteria_version_level_unique').on(
      table.typeVersionId,
      table.difficulty,
    ),
    check(
      'question_type_difficulty_criteria_level_range',
      sql`${table.difficulty} between 1 and 5`,
    ),
  ],
);

/** 활성화 전에 검증한 canonical 문제 예시 snapshot */
export const questionTypeApprovedExamples = pgTable(
  'question_type_approved_examples',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    typeVersionId: uuid('type_version_id')
      .references(() => questionTypeVersions.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    payloadHash: text('payload_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('question_type_approved_examples_payload_unique').on(
      table.typeVersionId,
      table.payloadHash,
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
    topicId: uuid('topic_id')
      .references(() => questionTopics.id, { onDelete: 'restrict' })
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

/** 문제 버전과 불변 태그 사전의 다대다 연결 */
export const questionVersionTags = pgTable(
  'question_version_tags',
  {
    questionVersionId: uuid('question_version_id')
      .references(() => questionVersions.id, { onDelete: 'restrict' })
      .notNull(),
    tagId: uuid('tag_id')
      .references(() => questionTags.id, { onDelete: 'restrict' })
      .notNull(),
  },
  (table) => [
    unique('question_version_tags_version_tag_unique').on(
      table.questionVersionId,
      table.tagId,
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
    sentenceVersionId: uuid('sentence_version_id').references(
      () => thaiSentenceVersions.id,
      { onDelete: 'restrict' },
    ),
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
      'question_options_sentence_or_span',
      sql`(${table.sentenceVersionId} is not null and ${table.spanSentenceVersionId} is null and ${table.spanStartTokenIndex} is null and ${table.spanEndTokenIndex} is null)
        or (${table.sentenceVersionId} is null and ${table.spanSentenceVersionId} is not null and ${table.spanStartTokenIndex} is not null and ${table.spanEndTokenIndex} is not null)`,
    ),
    check(
      'question_options_span_range',
      sql`${table.spanStartTokenIndex} is null or (${table.spanStartTokenIndex} >= 0 and ${table.spanEndTokenIndex} > ${table.spanStartTokenIndex})`,
    ),
  ],
);
