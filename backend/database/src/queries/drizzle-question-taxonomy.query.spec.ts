/** 문제 분류 설정 flat row 조립을 검증한다 */
import { describe, expect, it } from 'vitest';
import { assembleQuestionTaxonomySettings } from './drizzle-question-taxonomy.query.js';

describe('문제 분류 설정 조회 조립', () => {
  it('유형 버전에 난이도 기준과 승인 예시를 연결하고 안정적으로 정렬한다', () => {
    const result = assembleQuestionTaxonomySettings(
      [
        {
          id: 'type-1',
          slug: 'reading-vocabulary',
          displayName: '어휘',
          majorCategory: 'READING_VOCABULARY_GRAMMAR',
        },
      ],
      [
        {
          id: 'version-1',
          questionTypeId: 'type-1',
          version: 1,
          status: 'DRAFT',
          template: 'STANDARD_CHOICE',
          optionCount: 4,
          decisionRules: {},
        },
      ],
      [
        {
          typeVersionId: 'version-1',
          difficulty: 2,
          criteria: '기준 2',
        },
        {
          typeVersionId: 'version-1',
          difficulty: 1,
          criteria: '기준 1',
        },
      ],
      [
        {
          id: 'example-1',
          typeVersionId: 'version-1',
          title: '예시',
          payload: { difficulty: 1 },
        },
      ],
      [{ id: 'topic-1', slug: 'general', displayName: '일반', status: 'ACTIVE' }],
      [],
    );

    expect(
      result.questionTypes[0]?.versions[0]?.difficultyCriteria.map(
        ({ difficulty }) => difficulty,
      ),
    ).toEqual([1, 2]);
    expect(result.questionTypes[0]?.versions[0]?.approvedExamples).toHaveLength(
      1,
    );
    expect(result.topics[0]?.slug).toBe('general');
    expect(result.questionTypes[0]?.versions[0]).not.toHaveProperty(
      'questionTypeId',
    );
  });
});
