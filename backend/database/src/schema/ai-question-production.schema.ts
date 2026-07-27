/** AI 문제 후보와 단계별 검증 결과를 attempt별 불변 snapshot으로 저장한다 */
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { jobItems } from './jobs.schema.js';
import {
  questionTopics,
  questionTypeVersions,
  questionVersions,
} from './questions.schema.js';

/** AI 문제 후보의 검토 우선순위 그룹 */
export const questionCandidateGroupEnum = pgEnum('question_candidate_group', [
  'NORMAL',
  'NEEDS_ATTENTION',
  'FAILED',
]);

/** AI 문제 후보의 관리자 검토 상태 */
export const questionCandidateReviewStatusEnum = pgEnum(
  'question_candidate_review_status',
  ['PENDING', 'APPROVED', 'DISCARDED'],
);

/** AI 문제 후보의 검증 단계 */
export const questionValidationStageEnum = pgEnum('question_validation_stage', [
  'SCHEMA',
  'DECISION_RULE',
  'SIMILARITY',
  'AI_CROSS_VALIDATION',
]);

/** AI 문제 후보의 검증 결과 */
export const questionProductionValidationStatusEnum = pgEnum(
  'question_production_validation_status',
  ['PASSED', 'FAILED', 'SKIPPED'],
);

/** job item attempt에서 생성한 관리자 검토 대상 문제 후보 */
export const questionProductionCandidates = pgTable(
  'question_production_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobItemId: uuid('job_item_id')
      .references(() => jobItems.id)
      .notNull(),
    jobAttempt: integer('job_attempt').notNull(),
    ordinal: integer('ordinal').notNull(),
    typeVersionId: uuid('type_version_id')
      .references(() => questionTypeVersions.id, { onDelete: 'restrict' })
      .notNull(),
    topicId: uuid('topic_id')
      .references(() => questionTopics.id, { onDelete: 'restrict' })
      .notNull(),
    difficulty: integer('difficulty').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    payloadHash: text('payload_hash').notNull(),
    resultGroup: questionCandidateGroupEnum('result_group').notNull(),
    reviewStatus: questionCandidateReviewStatusEnum('review_status')
      .default('PENDING')
      .notNull(),
    reviewCode: text('review_code'),
    regeneratedFromCandidateId: uuid(
      'regenerated_from_candidate_id',
    ).references((): AnyPgColumn => questionProductionCandidates.id, {
      onDelete: 'restrict',
    }),
    approvedQuestionId: uuid('approved_question_id'),
    approvedQuestionVersionId: uuid('approved_question_version_id'),
    revision: integer('revision').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex(
      'question_production_candidates_item_attempt_ordinal_unique',
    ).on(table.jobItemId, table.jobAttempt, table.ordinal),
    foreignKey({
      name: 'question_production_candidates_approved_question_version_fk',
      columns: [table.approvedQuestionId, table.approvedQuestionVersionId],
      foreignColumns: [questionVersions.questionId, questionVersions.id],
    }).onDelete('restrict'),
    check(
      'question_production_candidates_attempt_nonnegative',
      sql`${table.jobAttempt} >= 0`,
    ),
    check(
      'question_production_candidates_ordinal_nonnegative',
      sql`${table.ordinal} >= 0`,
    ),
    check(
      'question_production_candidates_difficulty_range',
      sql`${table.difficulty} between 1 and 5`,
    ),
    check(
      'question_production_candidates_payload_hash_sha256',
      sql`${table.payloadHash} ~ '^[0-9A-Fa-f]{64}$'`,
    ),
    check(
      'question_production_candidates_revision_nonnegative',
      sql`${table.revision} >= 0`,
    ),
    check(
      'question_production_candidates_review_approval_consistency',
      sql`(${table.reviewStatus} = 'APPROVED' and ${table.approvedQuestionId} is not null and ${table.approvedQuestionVersionId} is not null) or (${table.reviewStatus} <> 'APPROVED' and ${table.approvedQuestionId} is null and ${table.approvedQuestionVersionId} is null)`,
    ),
  ],
);

/** 후보의 schema·결정 규칙·유사도·AI 교차 검증 결과 */
export const questionProductionValidations = pgTable(
  'question_production_validations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .references(() => questionProductionCandidates.id, {
        onDelete: 'restrict',
      })
      .notNull(),
    stage: questionValidationStageEnum('stage').notNull(),
    status: questionProductionValidationStatusEnum('status').notNull(),
    code: text('code'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('question_production_validations_candidate_stage_unique').on(
      table.candidateId,
      table.stage,
    ),
  ],
);
