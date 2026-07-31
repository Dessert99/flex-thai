/** AI 어휘 후보와 단계별 검증 결과를 attempt별 불변 snapshot으로 저장한다 */
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ExtractedVocabularyMeaning } from '@flex-thia/domain';
import { users } from './identity.schema.js';
import { jobItems } from './jobs.schema.js';
import { vocabularies, vocabularyKindEnum } from './vocabulary.schema.js';

/** AI 어휘 후보의 중복 분류 */
export const vocabularyCandidateClassificationEnum = pgEnum(
  'vocabulary_candidate_classification',
  [
    'NEW_VOCABULARY',
    'EXACT_EXISTING_MEANING',
    'EXACT_NEW_MEANING',
    'POSSIBLE_DUPLICATE',
  ],
);

/** AI 어휘 후보의 검토 그룹 */
export const vocabularyCandidateGroupEnum = pgEnum(
  'vocabulary_candidate_group',
  ['NORMAL', 'NEEDS_ATTENTION', 'FAILED'],
);

/** AI 어휘 후보의 관리자 검수 상태 */
export const vocabularyCandidateReviewStatusEnum = pgEnum(
  'vocabulary_candidate_review_status',
  ['PENDING', 'APPROVED', 'DISCARDED'],
);

/** 승인된 AI 어휘 후보의 terminal resolution 종류 */
export const vocabularyCandidateResolutionKindEnum = pgEnum(
  'vocabulary_candidate_resolution_kind',
  ['DRAFT_CREATED', 'EXISTING_LINKED'],
);

/** AI 어휘 후보의 검증 단계 */
export const vocabularyValidationStageEnum = pgEnum(
  'vocabulary_validation_stage',
  ['SCHEMA', 'DECISION_RULE', 'AI_CROSS_VALIDATION'],
);

/** AI 어휘 후보의 검증 결과 */
export const vocabularyValidationStatusEnum = pgEnum(
  'vocabulary_validation_status',
  ['PASSED', 'FAILED'],
);

/** job item attempt에서 생성된 검토 대상 어휘 후보 */
export const vocabularyProductionCandidates = pgTable(
  'vocabulary_production_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobItemId: uuid('job_item_id')
      .references(() => jobItems.id)
      .notNull(),
    jobAttempt: integer('job_attempt').notNull(),
    ordinal: integer('ordinal').notNull(),
    thai: text('thai').notNull(),
    normalizedThai: text('normalized_thai').notNull(),
    kind: vocabularyKindEnum('kind').notNull(),
    meanings: jsonb('meanings').$type<ExtractedVocabularyMeaning[]>().notNull(),
    classification:
      vocabularyCandidateClassificationEnum('classification').notNull(),
    resultGroup: vocabularyCandidateGroupEnum('result_group').notNull(),
    matchedVocabularyId: uuid('matched_vocabulary_id').references(
      () => vocabularies.id,
    ),
    suspectedMatches: jsonb('suspected_matches')
      .$type<
        Array<{
          vocabularyId: string;
          normalizedThai: string;
          codePointDistance: number;
        }>
      >()
      .notNull(),
    reviewCode: text('review_code'),
    reviewStatus: vocabularyCandidateReviewStatusEnum('review_status')
      .default('PENDING')
      .notNull(),
    revision: integer('revision').default(0).notNull(),
    resolutionKind: vocabularyCandidateResolutionKindEnum('resolution_kind'),
    resolvedVocabularyId: uuid('resolved_vocabulary_id').references(
      () => vocabularies.id,
      { onDelete: 'restrict' },
    ),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex(
      'vocabulary_production_candidates_item_attempt_ordinal_unique',
    ).on(table.jobItemId, table.jobAttempt, table.ordinal),
    check(
      'vocabulary_production_candidates_revision_nonnegative',
      sql`${table.revision} >= 0`,
    ),
    check(
      'vocabulary_production_candidates_review_resolution_consistency',
      sql`(${table.reviewStatus} = 'PENDING' and ${table.resolutionKind} is null and ${table.resolvedVocabularyId} is null and ${table.reviewedBy} is null and ${table.reviewedAt} is null) or (${table.reviewStatus} = 'APPROVED' and ${table.resolutionKind} is not null and ${table.resolvedVocabularyId} is not null and ${table.reviewedBy} is not null and ${table.reviewedAt} is not null) or (${table.reviewStatus} = 'DISCARDED' and ${table.resolutionKind} is null and ${table.resolvedVocabularyId} is null and ${table.reviewedBy} is not null and ${table.reviewedAt} is not null)`,
    ),
  ],
);

/** 후보의 schema·결정 규칙·AI 교차 검증 결과 */
export const vocabularyProductionValidations = pgTable(
  'vocabulary_production_validations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .references(() => vocabularyProductionCandidates.id)
      .notNull(),
    stage: vocabularyValidationStageEnum('stage').notNull(),
    status: vocabularyValidationStatusEnum('status').notNull(),
    code: text('code'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vocabulary_production_validations_candidate_stage_unique').on(
      table.candidateId,
      table.stage,
    ),
  ],
);
