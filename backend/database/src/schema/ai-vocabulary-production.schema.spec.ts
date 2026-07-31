/** AI 어휘 후보·검증과 provider 수명 schema 제약을 검증한다 */
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  vocabularyCandidateClassificationEnum,
  vocabularyCandidateGroupEnum,
  vocabularyCandidateResolutionKindEnum,
  vocabularyCandidateReviewStatusEnum,
  vocabularyProductionCandidates,
  vocabularyProductionValidations,
  vocabularyValidationStageEnum,
} from './ai-vocabulary-production.schema.js';
import {
  jobItems,
  providerRunStatusEnum,
  providerRuns,
} from './jobs.schema.js';

describe('AI 어휘 제작 schema', () => {
  it('후보 분류와 검증 단계를 고정한다', () => {
    expect(vocabularyCandidateClassificationEnum.enumValues).toEqual([
      'NEW_VOCABULARY',
      'EXACT_EXISTING_MEANING',
      'EXACT_NEW_MEANING',
      'POSSIBLE_DUPLICATE',
    ]);
    expect(vocabularyCandidateGroupEnum.enumValues).toEqual([
      'NORMAL',
      'NEEDS_ATTENTION',
      'FAILED',
    ]);
    expect(vocabularyValidationStageEnum.enumValues).toEqual([
      'SCHEMA',
      'DECISION_RULE',
      'AI_CROSS_VALIDATION',
    ]);
  });

  it('항목 입력·작업과 provider replay 필드를 저장한다', () => {
    expect(jobItems.jobInputId).toBeDefined();
    expect(jobItems.operation).toBeDefined();
    expect(providerRunStatusEnum.enumValues).toEqual([
      'STARTED',
      'SUCCEEDED',
      'FAILED',
      'OUTCOME_UNKNOWN',
    ]);
    expect(providerRuns.promptVersion).toBeDefined();
    expect(providerRuns.sequence).toBeDefined();
    expect(providerRuns.result).toBeDefined();
  });

  it('후보 attempt ordinal과 후보별 validation stage를 유일하게 한다', () => {
    expect(
      getTableConfig(vocabularyProductionCandidates).indexes.map(
        ({ config }) => config.name,
      ),
    ).toContain('vocabulary_production_candidates_item_attempt_ordinal_unique');
    expect(
      getTableConfig(vocabularyProductionValidations).indexes.map(
        ({ config }) => config.name,
      ),
    ).toContain('vocabulary_production_validations_candidate_stage_unique');
  });

  it('후보 검수 lifecycle과 resolution을 revision과 함께 저장한다', () => {
    expect(vocabularyCandidateReviewStatusEnum.enumValues).toEqual([
      'PENDING',
      'APPROVED',
      'DISCARDED',
    ]);
    expect(vocabularyCandidateResolutionKindEnum.enumValues).toEqual([
      'DRAFT_CREATED',
      'EXISTING_LINKED',
    ]);
    expect(vocabularyProductionCandidates.reviewStatus).toBeDefined();
    expect(vocabularyProductionCandidates.revision).toBeDefined();
    expect(vocabularyProductionCandidates.resolutionKind).toBeDefined();
    expect(vocabularyProductionCandidates.resolvedVocabularyId).toBeDefined();
    expect(vocabularyProductionCandidates.reviewedBy).toBeDefined();
    expect(vocabularyProductionCandidates.reviewedAt).toBeDefined();
    expect(vocabularyProductionCandidates.updatedAt).toBeDefined();
  });
});
