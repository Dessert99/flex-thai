/** AI 문제 생성 prompt 문맥이 공개 가능한 값만 안정적으로 조립되는지 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assembleQuestionProductionContext,
  type QuestionProductionContextRows,
} from './drizzle-question-production-context.query.js';

const rows: QuestionProductionContextRows = {
  approvedExamples: [
    {
      id: 'example-b',
      title: 'B 예시',
      payload: {
        questionTypeSlug: 'reading-choice',
        difficulty: 2,
        storageKey: 'private/approved-example.json',
        blocks: [{ mediaAssetId: 'private-media-id' }],
      },
    },
    {
      id: 'example-a',
      title: 'A 예시',
      payload: { questionTypeSlug: 'reading-choice', difficulty: 1 },
    },
  ],
  difficultyCriteria: [
    { difficulty: 4, criteria: '난이도 4' },
    { difficulty: 1, criteria: '난이도 1' },
  ],
  tags: [
    { id: 'tag-z', slug: 'zeta', displayName: '제타' },
    { id: 'tag-a', slug: 'alpha', displayName: '알파' },
  ],
  topics: [
    { id: 'topic-z', slug: 'zeta', displayName: '제타' },
    { id: 'topic-a', slug: 'alpha', displayName: '알파' },
  ],
  typeVersion: {
    id: 'type-version-id',
    slug: 'reading-choice',
    version: 2,
    template: 'STANDARD_CHOICE',
    decisionRules: { optionCount: 4 },
  },
};

describe('AI 문제 생성 문맥 조립', () => {
  it('활성 유형의 기준·예시·주제·태그와 preset 정책을 안정 순서로 공개한다', () => {
    const context = assembleQuestionProductionContext(rows, {
      additionalInstructionKo: '해설은 한국어로 작성',
      commonPrinciples: ['정답 하나', '원문 복제 금지'],
      excludedVocabulary: [
        {
          thai: '금지',
          meaningKo: '금지',
          partOfSpeech: '명사',
          difficulty: 3,
        },
      ],
      requiredVocabulary: [
        {
          thai: '필수',
          meaningKo: '필수',
          partOfSpeech: '동사',
          difficulty: 2,
        },
      ],
      targetVocabulary: [
        {
          thai: '목표',
          meaningKo: '목표',
          partOfSpeech: '명사',
          difficulty: 1,
        },
      ],
    });

    expect(
      context?.difficultyCriteria.map(({ difficulty }) => difficulty),
    ).toEqual([1, 4]);
    expect(context?.approvedExamples.map(({ title }) => title)).toEqual([
      'A 예시',
      'B 예시',
    ]);
    expect(context?.typeVersion.generationRules).toMatchObject({
      allowedTags: [
        { id: 'tag-a', slug: 'alpha', displayName: '알파' },
        { id: 'tag-z', slug: 'zeta', displayName: '제타' },
      ],
      allowedTopics: [
        { id: 'topic-a', slug: 'alpha', displayName: '알파' },
        { id: 'topic-z', slug: 'zeta', displayName: '제타' },
      ],
    });
    expect(context).not.toHaveProperty('storageKey');
    expect(context?.approvedExamples[1]?.payload).not.toHaveProperty(
      'storageKey',
    );
    expect(context?.approvedExamples[1]?.payload.blocks[0]).not.toHaveProperty(
      'mediaAssetId',
    );
    expect(context?.targetVocabulary).toEqual([
      { thai: '목표', meaningKo: '목표', partOfSpeech: '명사', difficulty: 1 },
    ]);
  });

  it('DRAFT와 RETIRED 유형은 생성 문맥으로 조립하지 않는다', () => {
    expect(
      assembleQuestionProductionContext({ ...rows, typeVersion: null }, {}),
    ).toBeNull();
  });
});
