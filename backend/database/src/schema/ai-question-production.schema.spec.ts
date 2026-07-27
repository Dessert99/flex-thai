/** AI 문제 후보·검증 schema의 재시도와 검토 불변식을 고정한다 */
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  questionCandidateGroupEnum,
  questionCandidateReviewStatusEnum,
  questionProductionCandidates,
  questionProductionValidations,
  questionValidationStageEnum,
  questionProductionValidationStatusEnum,
} from './ai-question-production.schema.js';

describe('AI 문제 제작 schema', () => {
  it('후보 그룹·검토 상태와 검증 단계를 고정한다', () => {
    expect(questionCandidateGroupEnum.enumValues).toEqual([
      'NORMAL',
      'NEEDS_ATTENTION',
      'FAILED',
    ]);
    expect(questionCandidateReviewStatusEnum.enumValues).toEqual([
      'PENDING',
      'APPROVED',
      'DISCARDED',
    ]);
    expect(questionValidationStageEnum.enumValues).toEqual([
      'SCHEMA',
      'DECISION_RULE',
      'SIMILARITY',
      'AI_CROSS_VALIDATION',
    ]);
    expect(questionProductionValidationStatusEnum.enumValues).toEqual([
      'PASSED',
      'FAILED',
    ]);
  });

  it('같은 항목 attempt의 후보 순서와 후보별 검증 단계를 유일하게 한다', () => {
    expect(
      getTableConfig(questionProductionCandidates).indexes.map(
        ({ config }) => config.name,
      ),
    ).toContain('question_production_candidates_item_attempt_ordinal_unique');
    expect(
      getTableConfig(questionProductionValidations).indexes.map(
        ({ config }) => config.name,
      ),
    ).toContain('question_production_validations_candidate_stage_unique');
  });

  it('후보의 canonical payload hash와 검토 상태를 필수로 저장한다', () => {
    const columns = getTableColumns(questionProductionCandidates);

    expect(columns.payloadHash.notNull).toBe(true);
    expect(columns.reviewStatus.notNull).toBe(true);
    expect(columns.revision.notNull).toBe(true);
    expect(columns.approvedQuestionId.notNull).toBe(false);
    expect(columns.approvedQuestionVersionId.notNull).toBe(false);
  });
});
