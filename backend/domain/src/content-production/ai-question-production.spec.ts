/** AI 문제 후보의 검증 결과가 안정적인 검토 그룹으로 분류되는지 확인한다 */
import { describe, expect, it } from 'vitest';
import {
  assertDistinctValidationModels,
  classifyQuestionCandidate,
  validateGeneratedQuestionSchema,
  validateQuestionDecisionRules,
  type GeneratedQuestionCandidate,
  type QuestionProductionValidationRecord,
} from './ai-question-production.js';

const makeValidationFixture = (
  failedCode:
    | 'QUESTION_SCHEMA_INVALID'
    | 'QUESTION_RULE_INVALID'
    | 'QUESTION_SIMILARITY_REVIEW'
    | 'QUESTION_CROSS_VALIDATION_FAILED'
    | null,
): QuestionProductionValidationRecord[] => {
  const records: QuestionProductionValidationRecord[] = [
    {
      candidateOrdinal: 0,
      stage: 'SCHEMA',
      status: failedCode === 'QUESTION_SCHEMA_INVALID' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_SCHEMA_INVALID' ? 'INVALID' : null,
      details: {},
    },
    {
      candidateOrdinal: 0,
      stage: 'DECISION_RULE',
      status: failedCode === 'QUESTION_RULE_INVALID' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_RULE_INVALID' ? 'INVALID' : null,
      details: {},
    },
    {
      candidateOrdinal: 0,
      stage: 'SIMILARITY',
      status:
        failedCode === 'QUESTION_SIMILARITY_REVIEW' ? 'FAILED' : 'PASSED',
      code: failedCode === 'QUESTION_SIMILARITY_REVIEW' ? 'TOO_SIMILAR' : null,
      details: {},
    },
    {
      candidateOrdinal: 0,
      stage: 'AI_CROSS_VALIDATION',
      status:
        failedCode === 'QUESTION_CROSS_VALIDATION_FAILED'
          ? 'FAILED'
          : 'PASSED',
      code:
        failedCode === 'QUESTION_CROSS_VALIDATION_FAILED'
          ? 'ANSWER_MISMATCH'
          : null,
      details: {},
    },
  ];

  return records;
};

const candidate: GeneratedQuestionCandidate = {
  questionTypeVersionId: 'type-version-id',
  topicId: 'topic-id',
  tagIds: ['tag-id'],
  difficulty: 3,
  payload: {
    questionTypeSlug: 'reading-choice',
    questionTypeVersion: 1,
    difficulty: 3,
    topicSlug: 'daily-life',
    tagSlugs: ['basic'],
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT',
        sentences: [],
      },
    ],
    options: [
      {
        clientRef: 'option-a',
        position: 0,
        sentence: {
          originalText: 'ใช่',
          translationKo: '예',
          pronunciationKo: '차이',
          toneMarks: '',
          tokens: [],
          expressions: [],
        },
        span: null,
      },
    ],
    correctOptionRef: 'option-a',
  },
};

describe('AI 문제 후보 검증 규칙', () => {
  it.each([
    ['schema 실패', 'FAILED', 'QUESTION_SCHEMA_INVALID'],
    ['결정 규칙 실패', 'FAILED', 'QUESTION_RULE_INVALID'],
    ['유사도 경고', 'NEEDS_ATTENTION', 'QUESTION_SIMILARITY_REVIEW'],
    [
      '교차 검증 불일치',
      'NEEDS_ATTENTION',
      'QUESTION_CROSS_VALIDATION_FAILED',
    ],
    ['모든 검증 통과', 'NORMAL', null],
  ] as const)('%s 후보 그룹을 계산한다', (_label, group, code) => {
    expect(classifyQuestionCandidate(makeValidationFixture(code))).toEqual({
      group,
      code,
    });
  });

  it('필수 출력 field가 빠진 후보를 schema 실패로 반환한다', () => {
    expect(validateGeneratedQuestionSchema({})).toEqual({
      status: 'FAILED',
      code: 'QUESTION_SCHEMA_INVALID',
    });
  });

  it('존재하지 않는 정답 선택지는 결정 규칙 실패로 반환한다', () => {
    expect(
      validateQuestionDecisionRules({
        ...candidate,
        payload: { ...candidate.payload, correctOptionRef: 'missing-option' },
      }),
    ).toEqual({
      status: 'FAILED',
      code: 'QUESTION_RULE_INVALID',
    });
  });

  it('생성 모델과 교차 검증 모델이 같으면 provider 호출 전에 거절한다', () => {
    expect(() =>
      assertDistinctValidationModels('generation-model', 'generation-model'),
    ).toThrowError('QUESTION_VALIDATION_MODEL_DUPLICATE');
  });
});
