/** AI 어휘 후보와 단계별 검증 결과를 attempt별 불변 snapshot으로 저장한다 */
import {
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex(
      'vocabulary_production_candidates_item_attempt_ordinal_unique',
    ).on(table.jobItemId, table.jobAttempt, table.ordinal),
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
