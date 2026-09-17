/** 문제 유형과 불변 문제 버전의 블록·선택지 게시 구조를 저장한다 */
import type { QuestionOption } from '@flex-thia/domain/questions/question';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { vocabularies, vocabularyMeanings } from './vocabulary.schema.js';

/** 문제의 읽기 시험 영역 */
export const questionSkillEnum = pgEnum('question_skill', ['READING']);

/** 선택형 문제의 화면 구조 */
export const questionTemplateEnum = pgEnum('question_template', [
  'STANDARD_CHOICE',
  'PASSAGE_CHOICE',
  'DIALOGUE_CHOICE',
  'INLINE_SPAN_CHOICE',
]);

/** FLEX 읽기 영역의 네 가지 문제 분류 */
export const questionMajorCategoryEnum = pgEnum('question_major_category', [
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

/** 문제 본문과 현재 버전을 한 행에 저장한다. 과거 풀이는 attempt snapshot에 남긴다. */
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    typeVersionId: uuid('type_version_id')
      .references(() => questionTypeVersions.id, { onDelete: 'restrict' })
      .notNull(),
    topicId: uuid('topic_id')
      .references(() => questionTopics.id, { onDelete: 'restrict' })
      .notNull(),
    tagIds: uuid('tag_ids').array().default([]).notNull(),
    passage: text('passage'),
    prompt: text('prompt').notNull(),
    options: jsonb('options').$type<QuestionOption[]>().notNull(),
    correctOptionId: uuid('correct_option_id').notNull(),
    explanation: text('explanation').notNull(),
    difficulty: integer('difficulty').notNull(),
    version: integer('version').default(1).notNull(),
    status: questionStatusEnum('status').default('DRAFT').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check('questions_version_positive', sql`${table.version} > 0`),
    check(
      'questions_difficulty_range',
      sql`${table.difficulty} between 1 and 5`,
    ),
    check(
      'questions_options_count',
      sql`jsonb_typeof(${table.options}) = 'array' and jsonb_array_length(${table.options}) between 2 and 10`,
    ),
    check(
      'questions_correct_option_exists',
      sql`${table.options} @> jsonb_build_array(jsonb_build_object('id', ${table.correctOptionId}::text))`,
    ),
  ],
);

export const questionVocabularyRoleEnum = pgEnum('question_vocabulary_role', [
  'TARGET',
  'CONTEXT',
]);

/** 현재 문제의 출제 목표·문맥 어휘와 실제 등장 횟수의 원본 기록. */
export const questionVocabularies = pgTable(
  'question_vocabularies',
  {
    questionId: uuid('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    meaningId: uuid('meaning_id'),
    role: questionVocabularyRoleEnum('role').notNull(),
    occurrenceCount: integer('occurrence_count').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.questionId, table.vocabularyId] }),
    index('question_vocabularies_vocabulary_idx').on(table.vocabularyId),
    foreignKey({
      name: 'question_vocabularies_meaning_owner_fk',
      columns: [table.meaningId, table.vocabularyId],
      foreignColumns: [vocabularyMeanings.id, vocabularyMeanings.vocabularyId],
    }).onDelete('restrict'),
    check(
      'question_vocabularies_occurrence_positive',
      sql`${table.occurrenceCount} > 0`,
    ),
  ],
);
