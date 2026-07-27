/** 문제 분류 설정 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  createQuestionTypeRequestSchema,
  createQuestionTypeVersionRequestSchema,
  questionMajorCategorySchema,
  questionTypeApprovedExampleRequestSchema,
  questionTypeVersionStatusSchema,
  replaceDifficultyCriteriaRequestSchema,
} from './question-taxonomy-settings.js';

const id = '00000000-0000-4000-8000-000000000001';
const sentence = {
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디',
  toneMarks: 'L-L-M',
  mediaAssetId: id,
  tokens: [],
  expressions: [],
} as const;
const canonicalExample = {
  questionTypeSlug: 'reading-vocabulary',
  questionTypeVersion: 1,
  difficulty: 3,
  blocks: [
    {
      kind: 'QUESTION',
      displayMode: 'TEXT',
      sentences: [{ speaker: null, sentence }],
    },
  ],
  options: [
    { clientRef: 'a', position: 0, sentence, span: null },
    { clientRef: 'b', position: 1, sentence, span: null },
    { clientRef: 'c', position: 2, sentence, span: null },
    { clientRef: 'd', position: 3, sentence, span: null },
  ],
  correctOptionRef: 'a',
} as const;

describe('문제 분류 설정 계약', () => {
  it('FLEX 7대 분류와 세 단계 lifecycle만 허용한다', () => {
    expect(questionMajorCategorySchema.options).toHaveLength(7);
    expect(questionMajorCategorySchema.parse('LISTENING_RESPONSE')).toBe(
      'LISTENING_RESPONSE',
    );
    expect(questionTypeVersionStatusSchema.options).toEqual([
      'DRAFT',
      'ACTIVE',
      'RETIRED',
    ]);
    expect(() => questionTypeVersionStatusSchema.parse('DISCARDED')).toThrow();
  });

  it('세부 유형 생성 시 대분류에서 skill을 파생한다', () => {
    expect(
      createQuestionTypeRequestSchema.parse({
        slug: 'listening-response',
        displayName: '반응 테스트',
        majorCategory: 'LISTENING_RESPONSE',
      }),
    ).toEqual({
      slug: 'listening-response',
      displayName: '반응 테스트',
      majorCategory: 'LISTENING_RESPONSE',
    });
  });

  it('유형 버전 선택지 수는 3개 또는 4개만 허용한다', () => {
    const input = {
      template: 'STANDARD_CHOICE',
      optionCount: 4,
      decisionRules: { mode: 'single-choice' },
    };

    expect(createQuestionTypeVersionRequestSchema.parse(input)).toEqual(input);
    expect(() =>
      createQuestionTypeVersionRequestSchema.parse({
        ...input,
        optionCount: 2,
      }),
    ).toThrow();
  });

  it('난이도 기준은 1부터 5까지 모두 요구한다', () => {
    const criteria = [1, 2, 3, 4, 5].map((difficulty) => ({
      difficulty,
      criteria: `${difficulty}단계 기준`,
    }));

    expect(
      replaceDifficultyCriteriaRequestSchema.parse({ criteria }).criteria,
    ).toHaveLength(5);
    expect(() =>
      replaceDifficultyCriteriaRequestSchema.parse({
        criteria: criteria.slice(0, 4),
      }),
    ).toThrow();
  });

  it('승인 예시는 canonical 문제 snapshot을 검증한다', () => {
    expect(
      questionTypeApprovedExampleRequestSchema.parse({
        title: '어휘 기본 예시',
        payload: canonicalExample,
      }).payload.difficulty,
    ).toBe(3);
    expect(() =>
      questionTypeApprovedExampleRequestSchema.parse({
        title: '깨진 예시',
        payload: { ...canonicalExample, correctOptionRef: 'missing' },
      }),
    ).toThrow();
  });
});
