/** AI 문제 생성 prompt 문맥이 공개 가능한 값만 안정적으로 조립되는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  assembleQuestionProductionContext,
  DrizzleQuestionProductionContextQuery,
  readQuestionProductionPresetPolicy,
  type QuestionProductionContextRows,
} from './drizzle-question-production-context.query.js';

const rows: QuestionProductionContextRows = {
  approvedExamples: [
    {
      id: 'example-b',
      title: 'B 예시',
      payload: {
        questionTypeSlug: 'reading-choice',
        questionTypeVersion: 2,
        difficulty: 2,
        topicSlug: 'general',
        tagSlugs: [],
        blocks: [],
        options: [],
        correctOptionRef: 'option-a',
        arbitraryPrivateAlias: 'private/approved-example.json',
      },
    },
    {
      id: 'example-a',
      title: 'A 예시',
      payload: {
        questionTypeSlug: 'reading-choice',
        questionTypeVersion: 2,
        difficulty: 1,
        topicSlug: 'general',
        tagSlugs: [],
        blocks: [],
        options: [],
        correctOptionRef: 'option-a',
      },
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
    optionCount: 4,
    decisionRules: { mode: 'single-choice' },
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
        {
          thai: '가나다',
          meaningKo: '앞선 목표',
          partOfSpeech: '명사',
          difficulty: 1,
        },
      ],
      newAuxiliaryVocabularyLimit: 2,
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
    expect(context?.typeVersion.structureRules).toEqual({
      optionCount: 4,
      template: 'STANDARD_CHOICE',
    });
    expect(context?.approvedExamples[1]?.payload).not.toHaveProperty(
      'arbitraryPrivateAlias',
    );
    expect(context?.targetVocabulary).toEqual([
      {
        thai: '가나다',
        meaningKo: '앞선 목표',
        partOfSpeech: '명사',
        difficulty: 1,
      },
      { thai: '목표', meaningKo: '목표', partOfSpeech: '명사', difficulty: 1 },
    ]);
    expect(context?.newAuxiliaryVocabularyLimit).toBe(2);
  });

  it('DRAFT와 RETIRED 유형은 생성 문맥으로 조립하지 않는다', () => {
    expect(
      assembleQuestionProductionContext({ ...rows, typeVersion: null }, {}),
    ).toBeNull();
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'preset 신규 보조 어휘 한도 %s를 거절한다',
    (newAuxiliaryVocabularyLimit) => {
      expect(() =>
        readQuestionProductionPresetPolicy({ newAuxiliaryVocabularyLimit }),
      ).toThrowError('QUESTION_AUXILIARY_VOCABULARY_LIMIT_INVALID');
    },
  );

  it('실제 조회 조건에서 ACTIVE 유형 버전만 선택한다', async () => {
    const where = vi.fn();
    const versionLimit = vi.fn().mockResolvedValue([
      {
        id: 'type-version-id',
        slug: 'reading-choice',
        version: 2,
        template: 'STANDARD_CHOICE',
        optionCount: 4,
        decisionRules: {},
      },
    ]);
    const versionWhere = vi.fn((condition: unknown) => {
      where(condition);
      return { limit: versionLimit };
    });
    const versionJoin = vi.fn(() => ({ where: versionWhere }));
    const versionFrom = vi.fn(() => ({ innerJoin: versionJoin }));
    const emptyOrder = vi.fn().mockResolvedValue([]);
    const emptyWhere = vi.fn(() => ({ orderBy: emptyOrder }));
    const emptyFrom = vi.fn(() => ({ where: emptyWhere, orderBy: emptyOrder }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: versionFrom })
      .mockReturnValue({ from: emptyFrom });
    const query = new DrizzleQuestionProductionContextQuery({
      select,
    } as never);

    await query.load({
      operation: 'QUESTION_GENERATION',
      questionPlan: {
        questionPlanIndex: 0,
        questionTypeVersionId: 'type-version-id',
        difficulty: 3,
      },
      preset: {
        id: 'preset-id',
        name: '문제 생성',
        purpose: 'QUESTION_GENERATION',
        version: 1,
        parameters: {
          newAuxiliaryVocabularyLimit: 0,
          similarityThreshold: 0.7,
          speakerVoiceAssignments: [
            {
              speakerRole: ' 진행자 ',
              voicePresetId: '00000000-0000-4000-8000-000000000001',
            },
          ],
        },
      },
    });

    const compiled = new PgDialect().sqlToQuery(
      where.mock.calls[0]?.[0] as never,
    );
    expect(compiled.sql).toContain('"question_type_versions"."status" =');
    expect(compiled.params).toContain('ACTIVE');
  });

  it('item 난이도와 trim된 speaker role을 문맥에 고정한다', () => {
    expect(
      assembleQuestionProductionContext(
        rows,
        {
          newAuxiliaryVocabularyLimit: 0,
          similarityThreshold: 0.75,
          speakerRoles: [' 학습자 ', '진행자'],
        },
        {
          questionPlanIndex: 0,
          questionTypeVersionId: 'type-version-id',
          difficulty: 4,
        },
      ),
    ).toMatchObject({
      difficulty: 4,
      similarityThreshold: 0.75,
      speakerRoles: ['진행자', '학습자'],
    });
  });
});
