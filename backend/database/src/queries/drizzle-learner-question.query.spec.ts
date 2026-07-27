/** 학습자 문제 read model의 공개 범위·historical 판정·정답 비노출을 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../schema/index.js';
import {
  questionTags,
  questionTopics,
  questionAttempts,
  questionBlocks,
  questionTypes,
  questionVersionTags,
  questions,
} from '../schema/index.js';
import { DrizzleLearnerQuestionQuery } from './drizzle-learner-question.query.js';

type QueryResult = Array<Record<string, unknown>>;

interface SelectCall {
  fields: Record<string, unknown>;
  from?: unknown;
  joins: Array<{ kind: 'inner' | 'left'; table: unknown; condition: unknown }>;
  condition?: unknown;
  orderBy: unknown[];
  limit?: number;
  offset?: number;
}

const toSql = (value: unknown) => new PgDialect().sqlToQuery(value as never);

const createSelectFake = (selectResults: QueryResult[]) => {
  const results = [...selectResults];
  const selectCalls: SelectCall[] = [];
  const createSelect = (fields: Record<string, unknown>) => {
    const call: SelectCall = { fields, joins: [], orderBy: [] };
    selectCalls.push(call);
    const chain = {
      from: vi.fn((table: unknown) => {
        call.from = table;
        return chain;
      }),
      innerJoin: vi.fn((table: unknown, condition: unknown) => {
        call.joins.push({ kind: 'inner', table, condition });
        return chain;
      }),
      leftJoin: vi.fn((table: unknown, condition: unknown) => {
        call.joins.push({ kind: 'left', table, condition });
        return chain;
      }),
      where: vi.fn((condition: unknown) => {
        call.condition = condition;
        return chain;
      }),
      orderBy: vi.fn((...orderBy: unknown[]) => {
        call.orderBy = orderBy;
        return chain;
      }),
      limit: vi.fn((limit: number) => {
        call.limit = limit;
        return chain;
      }),
      offset: vi.fn((offset: number) => {
        call.offset = offset;
        return chain;
      }),
      then: (
        resolve: (value: QueryResult) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(results.shift() ?? []).then(resolve, reject),
    };
    return chain;
  };
  const select = vi.fn(createSelect);
  const selectDistinct = vi.fn(createSelect);
  const database = {
    select,
    selectDistinct,
    $with: vi.fn(() => ({
      as: vi.fn(() => ({
        questionVersionId: schema.questionVersions.id,
        questionTypeId: schema.questionTypeVersions.questionTypeId,
        majorCategory: schema.questionTypes.majorCategory,
        topicId: schema.questionVersions.topicId,
      })),
    })),
    with: vi.fn(() => ({ selectDistinct })),
  };
  return { database, selectCalls };
};

describe('DrizzleLearnerQuestionQuery 문제 목록', () => {
  it('현재 게시 문제를 모든 필터와 안정적인 페이지 순서로 조회한다', async () => {
    const fake = createSelectFake([
      [{ totalItems: 1 }],
      [
        {
          questionId: 'question-id',
          questionVersionId: 'version-id',
          questionTypeId: 'type-id',
          questionTypeSlug: 'reading-choice',
          questionTypeDisplayName: '독해 선택',
          majorCategory: 'READING_PASSAGE',
          topicId: 'topic-id',
          topicSlug: 'travel',
          topicDisplayName: '여행',
          skill: 'READING',
          difficulty: 3,
          saved: true,
          firstResult: 'CORRECT',
        },
      ],
      [
        {
          questionVersionId: 'version-id',
          tagId: 'tag-1',
          tagSlug: 'grammar',
          tagDisplayName: '문법',
        },
        {
          questionVersionId: 'version-id',
          tagId: 'tag-2',
          tagSlug: 'vocabulary',
          tagDisplayName: '어휘',
        },
      ],
    ]);
    const query = new DrizzleLearnerQuestionQuery(fake.database as never);

    await expect(
      query.listQuestions('user-id', {
        skill: 'READING',
        majorCategory: 'READING_PASSAGE',
        questionTypeId: 'type-id',
        topicId: 'topic-id',
        tagId: 'tag-id',
        difficulty: 3,
        saved: true,
        firstResult: 'CORRECT',
        sort: 'LATEST',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual({
      items: [
        {
          questionId: 'question-id',
          questionVersionId: 'version-id',
          questionType: {
            id: 'type-id',
            slug: 'reading-choice',
            displayName: '독해 선택',
          },
          majorCategory: 'READING_PASSAGE',
          topic: {
            id: 'topic-id',
            slug: 'travel',
            displayName: '여행',
          },
          tags: [
            { id: 'tag-1', slug: 'grammar', displayName: '문법' },
            { id: 'tag-2', slug: 'vocabulary', displayName: '어휘' },
          ],
          skill: 'READING',
          difficulty: 3,
          saved: true,
          firstResult: 'CORRECT',
        },
      ],
      page: { page: 2, pageSize: 10, totalItems: 1, totalPages: 1 },
    });

    expect(fake.selectCalls).toHaveLength(3);
    for (const call of fake.selectCalls.slice(0, 2)) {
      expect(call.from).toBe(questions);
      expect(call.joins.map((join) => join.kind)).toEqual([
        'inner',
        'inner',
        'inner',
        'inner',
        'left',
        'left',
        'left',
      ]);
      const params = [
        ...call.joins.flatMap((join) => toSql(join.condition).params),
        ...toSql(call.condition).params,
      ];
      expect(params).toEqual(
        expect.arrayContaining([
          'PUBLISHED',
          'user-id',
          1,
          'INVALIDATED',
          'READING',
          'READING_PASSAGE',
          'type-id',
          'topic-id',
          'tag-id',
          3,
          'CORRECT',
        ]),
      );
    }
    expect(Object.keys(fake.selectCalls[1]?.fields ?? {})).not.toEqual(
      expect.arrayContaining([
        'isCorrect',
        'correctOptionId',
        'validationStatus',
        'validationIssues',
        'storageKey',
      ]),
    );
    expect(fake.selectCalls[1]).toMatchObject({ limit: 10, offset: 10 });
    expect(toSql(fake.selectCalls[1]?.orderBy[0]).sql).toContain(
      '"question_versions"."published_at" desc',
    );
    expect(toSql(fake.selectCalls[1]?.orderBy[1]).sql).toContain(
      '"questions"."id" desc',
    );
    expect(fake.selectCalls[2]?.orderBy).toHaveLength(3);
    expect(fake.selectCalls[2]?.from).toBe(questionVersionTags);
    expect(toSql(fake.selectCalls[2]?.orderBy[1]).sql).toContain(
      '"question_tags"."slug" asc',
    );
    expect(toSql(fake.selectCalls[0]?.condition).sql).toContain('exists');
  });

  it('현재 공개 문제에서만 중복 없는 안정적 facet을 만든다', async () => {
    const fake = createSelectFake([
      [
        { majorCategory: 'LISTENING_DIALOGUE' },
        { majorCategory: 'READING_PASSAGE' },
      ],
      [
        {
          id: 'type-2',
          slug: 'listening-choice',
          displayName: '듣기 선택',
          majorCategory: 'LISTENING_DIALOGUE',
        },
        {
          id: 'type-1',
          slug: 'reading-choice',
          displayName: '독해 선택',
          majorCategory: 'READING_PASSAGE',
        },
      ],
      [{ id: 'topic-1', slug: 'daily-life', displayName: '일상생활' }],
      [
        { id: 'tag-1', slug: 'grammar', displayName: '문법' },
        { id: 'tag-2', slug: 'vocabulary', displayName: '어휘' },
      ],
    ]);
    const query = new DrizzleLearnerQuestionQuery(fake.database as never);

    await expect(query.listQuestionFacets()).resolves.toEqual({
      majorCategories: [
        { value: 'LISTENING_DIALOGUE', label: '대화문' },
        { value: 'READING_PASSAGE', label: '지문 독해' },
      ],
      questionTypes: [
        {
          id: 'type-2',
          slug: 'listening-choice',
          displayName: '듣기 선택',
          majorCategory: 'LISTENING_DIALOGUE',
        },
        {
          id: 'type-1',
          slug: 'reading-choice',
          displayName: '독해 선택',
          majorCategory: 'READING_PASSAGE',
        },
      ],
      topics: [{ id: 'topic-1', slug: 'daily-life', displayName: '일상생활' }],
      tags: [
        { id: 'tag-1', slug: 'grammar', displayName: '문법' },
        { id: 'tag-2', slug: 'vocabulary', displayName: '어휘' },
      ],
    });

    expect(fake.database.$with).toHaveBeenCalledWith(
      'public_current_question_versions',
    );
    expect(fake.database.with).toHaveBeenCalledTimes(4);
    expect(fake.selectCalls).toHaveLength(5);
    expect(fake.selectCalls[0]?.from).toBe(questions);
    expect(fake.selectCalls[0]?.joins.map((join) => join.kind)).toEqual([
      'inner',
      'inner',
      'inner',
    ]);
    expect([
      ...fake.selectCalls[0]!.joins.flatMap(
        (join) => toSql(join.condition).params,
      ),
      ...toSql(fake.selectCalls[0]?.condition).params,
    ]).toEqual(expect.arrayContaining(['PUBLISHED']));
    expect(fake.selectCalls[2]?.from).toBe(questionTypes);
    expect(fake.selectCalls[3]?.from).toBe(questionTopics);
    expect(fake.selectCalls[4]?.from).toBe(questionVersionTags);
    expect(fake.selectCalls[4]?.joins[1]?.table).toBe(questionTags);
    expect(Object.keys(fake.selectCalls[1]?.fields ?? {})).toEqual([
      'majorCategory',
      'sortRank',
    ]);
    expect(toSql(fake.selectCalls[1]?.fields.sortRank).sql).toBe(
      toSql(fake.selectCalls[1]?.orderBy[0]).sql,
    );
    expect(toSql(fake.selectCalls[1]?.orderBy[0]).sql).toContain('case');
    expect(toSql(fake.selectCalls[2]?.orderBy[0]).sql).toContain(
      'display_name',
    );
    expect(toSql(fake.selectCalls[2]?.orderBy[1]).sql).toContain('"id" asc');
    expect(toSql(fake.selectCalls[3]?.orderBy[0]).sql).toContain(
      'display_name',
    );
    expect(toSql(fake.selectCalls[4]?.orderBy[0]).sql).toContain(
      'display_name',
    );
  });

  it('invalidated 첫 답은 미응답이고 retired 첫 답은 결과에 유지한다', async () => {
    const fake = createSelectFake([[{ totalItems: 2 }], []]);
    const query = new DrizzleLearnerQuestionQuery(fake.database as never);

    await query.listQuestions('user-id', {
      firstResult: 'UNANSWERED',
      sort: 'LATEST',
      page: 1,
      pageSize: 20,
    });

    const conditionSql = toSql(fake.selectCalls[1]?.condition);
    const joinSql = fake.selectCalls[1]?.joins
      .map((join) => toSql(join.condition))
      .map((query) => query.sql)
      .join(' ');
    expect(joinSql).toContain('attempt_no');
    expect(conditionSql.sql).not.toContain('RETIRED');
    expect([
      ...(fake.selectCalls[1]?.joins.flatMap(
        (join) => toSql(join.condition).params,
      ) ?? []),
      ...conditionSql.params,
    ]).toEqual(
      expect.arrayContaining(['user-id', 1, 'INVALIDATED', 'UNANSWERED']),
    );
  });
});

describe('DrizzleLearnerQuestionQuery 문제 상세와 해설', () => {
  it('position과 동일 span의 occurrence id 순으로 조립하고 같은 sentence projection을 재사용한다', async () => {
    const fake = createSelectFake([
      [
        {
          questionId: 'question-id',
          questionVersionId: 'version-id',
          questionTypeId: 'type-id',
          questionTypeSlug: 'reading-choice',
          questionTypeDisplayName: '독해 선택',
          skill: 'READING',
          difficulty: 3,
          template: 'INLINE_SPAN_CHOICE',
          saved: true,
        },
      ],
      [
        {
          id: 'block-2',
          kind: 'QUESTION',
          displayMode: 'TEXT',
          position: 2,
        },
        {
          id: 'block-1',
          kind: 'INSTRUCTION',
          displayMode: 'TEXT_AND_AUDIO',
          position: 1,
        },
      ],
      [
        {
          blockId: 'block-2',
          sentenceVersionId: 'sentence-id',
          position: 1,
          speaker: null,
        },
        {
          blockId: 'block-1',
          sentenceVersionId: 'sentence-id',
          position: 0,
          speaker: 'A',
        },
      ],
      [
        {
          id: 'option-2',
          sentenceVersionId: null,
          position: 2,
          spanSentenceVersionId: 'sentence-id',
          spanStartTokenIndex: 1,
          spanEndTokenIndex: 2,
        },
        {
          id: 'option-1',
          sentenceVersionId: null,
          position: 1,
          spanSentenceVersionId: 'sentence-id',
          spanStartTokenIndex: 0,
          spanEndTokenIndex: 1,
        },
      ],
      [
        {
          sentenceVersionId: 'sentence-id',
          originalText: 'สวัสดี',
          translationKo: '안녕하세요',
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaStorageKey: 'private/sentence.mp3',
        },
      ],
      [
        {
          sentenceVersionId: 'sentence-id',
          position: 1,
          surface: 'ดี',
          startOffset: 4,
          endOffset: 6,
          vocabularyId: 'vocabulary-2',
          meaningId: 'meaning-2',
          pronunciationId: 'pronunciation-2',
          contextMeaningKo: '좋다',
          pronunciationKo: '디',
          toneMarks: 'M',
          mediaStorageKey: 'private/token-2.mp3',
          role: 'SUPPORTING',
        },
        {
          sentenceVersionId: 'sentence-id',
          position: 0,
          surface: 'สวัสดี',
          startOffset: 0,
          endOffset: 4,
          vocabularyId: 'vocabulary-1',
          meaningId: 'meaning-1',
          pronunciationId: 'pronunciation-1',
          contextMeaningKo: '안녕',
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaStorageKey: 'private/token-1.mp3',
          role: 'TARGET',
        },
      ],
      [
        {
          sentenceVersionId: 'sentence-id',
          occurrenceId: 'occurrence-2',
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabularyId: 'expression-2',
          meaningId: 'expression-meaning-2',
          pronunciationId: 'expression-pronunciation-2',
          contextMeaningKo: '인사',
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaStorageKey: 'private/expression-2.mp3',
          representative: false,
        },
        {
          sentenceVersionId: 'sentence-id',
          occurrenceId: 'occurrence-1',
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabularyId: 'expression-1',
          meaningId: 'expression-meaning-1',
          pronunciationId: 'expression-pronunciation-1',
          contextMeaningKo: '안녕하세요',
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaStorageKey: 'private/expression-1.mp3',
          representative: true,
        },
        {
          sentenceVersionId: 'sentence-id',
          occurrenceId: 'occurrence-3',
          startTokenIndex: 1,
          endTokenIndex: 3,
          vocabularyId: 'expression-3',
          meaningId: 'expression-meaning-3',
          pronunciationId: 'expression-pronunciation-3',
          contextMeaningKo: '좋은 인사',
          pronunciationKo: '디',
          toneMarks: 'M',
          mediaStorageKey: 'private/expression-3.mp3',
          representative: false,
        },
      ],
    ]);
    const query = new DrizzleLearnerQuestionQuery(fake.database as never);

    const detail = await query.getQuestionDetail('user-id', 'question-id');

    expect(detail).not.toBeNull();
    expect(detail?.blocks.map((block) => block.position)).toEqual([1, 2]);
    expect(detail?.options.map((option) => option.position)).toEqual([1, 2]);
    expect(detail?.options[0]?.span).toEqual({
      sentenceVersionId: 'sentence-id',
      startTokenIndex: 0,
      endTokenIndex: 1,
    });
    expect(
      detail?.blocks[0]?.sentences[0]?.sentence.tokens.map(
        (token) => token.position,
      ),
    ).toEqual([0, 1]);
    expect(
      detail?.blocks[0]?.sentences[0]?.sentence.expressions.map(
        (expression) => expression.vocabularyId,
      ),
    ).toEqual(['expression-1', 'expression-2', 'expression-3']);
    expect(detail?.blocks[0]?.sentences[0]?.sentence.tokens[0]).toMatchObject({
      pronunciationKo: '싸왓디',
      toneMarks: 'L-L-M',
      media: { storageKey: 'private/token-1.mp3' },
    });
    expect(
      detail?.blocks[0]?.sentences[0]?.sentence.expressions[0],
    ).toMatchObject({
      meaningId: 'expression-meaning-1',
      contextMeaningKo: '안녕하세요',
      media: { storageKey: 'private/expression-1.mp3' },
    });
    expect(
      fake.selectCalls[6]?.orderBy.map((order) => toSql(order).sql),
    ).toEqual([
      expect.stringContaining('"sentence_version_id" asc'),
      expect.stringContaining('"start_token_index" asc'),
      expect.stringContaining('"end_token_index" asc'),
      expect.stringContaining('"id" asc'),
    ]);
    expect(detail?.options[0]?.sentence).toBeNull();
    expect(detail?.blocks[0]?.sentences[0]?.sentence.media).toEqual({
      storageKey: 'private/sentence.mp3',
    });

    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('validation');
    expect(serialized).not.toContain('EXPLANATION');
    expect(serialized).not.toContain('occurrenceId');
    expect(Object.keys(fake.selectCalls[3]?.fields ?? {})).not.toContain(
      'isCorrect',
    );
    expect(toSql(fake.selectCalls[1]?.condition).params).toContain(
      'EXPLANATION',
    );
  });

  it('숨김 또는 current 비게시 문제는 상세를 반환하지 않는다', async () => {
    const fake = createSelectFake([[]]);
    const query = new DrizzleLearnerQuestionQuery(fake.database as never);

    await expect(
      query.getQuestionDetail('user-id', 'hidden-question-id'),
    ).resolves.toBeNull();
    expect(fake.selectCalls).toHaveLength(1);
    expect([
      ...fake.selectCalls[0]!.joins.flatMap(
        (join) => toSql(join.condition).params,
      ),
      ...toSql(fake.selectCalls[0]?.condition).params,
    ]).toEqual(
      expect.arrayContaining([
        'hidden-question-id',
        'PUBLISHED',
        'PUBLISHED',
        'user-id',
      ]),
    );
  });

  it('historical version 상태와 current 여부 없이 해설 블록만 복원한다', async () => {
    const fake = createSelectFake([
      [
        {
          id: 'explanation-block',
          kind: 'EXPLANATION',
          displayMode: 'TEXT',
          position: 3,
        },
      ],
      [
        {
          blockId: 'explanation-block',
          sentenceVersionId: 'sentence-id',
          position: 0,
          speaker: null,
        },
      ],
      [
        {
          sentenceVersionId: 'sentence-id',
          originalText: 'คำอธิบาย',
          translationKo: '해설',
          pronunciationKo: '캄아티바이',
          toneMarks: '-',
          mediaStorageKey: 'private/explanation.mp3',
        },
      ],
      [],
      [],
    ]);
    const query = new DrizzleLearnerQuestionQuery(fake.database as never);

    const explanation = await query.getExplanation('retired-version-id');

    expect(explanation).toHaveLength(1);
    expect(explanation[0]).toMatchObject({
      kind: 'EXPLANATION',
      position: 3,
    });
    expect(fake.selectCalls[0]?.from).toBe(questionBlocks);
    expect(fake.selectCalls[0]?.joins).toHaveLength(0);
    expect(toSql(fake.selectCalls[0]?.condition).params).toEqual([
      'retired-version-id',
      'EXPLANATION',
    ]);
  });
});

describe('DrizzleLearnerQuestionQuery 원시 풀이 기록', () => {
  it('invalidated 기록도 제출 역순과 ID tie-breaker로 page에 보존한다', async () => {
    const submittedAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createSelectFake([
      [{ totalItems: 1 }],
      [
        {
          id: 'attempt-id',
          questionId: 'question-id',
          questionVersionId: 'invalidated-version-id',
          attemptNo: 1,
          selectedOptionId: 'option-id',
          clientAttemptId: 'client-id',
          durationMs: 10,
          isCorrect: false,
          submittedAt,
        },
      ],
    ]);
    const query = new DrizzleLearnerQuestionQuery(fake.database as never);

    await expect(
      query.listAttempts('user-id', { page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [
        {
          id: 'attempt-id',
          questionId: 'question-id',
          questionVersionId: 'invalidated-version-id',
          attemptNo: 1,
          selectedOptionId: 'option-id',
          clientAttemptId: 'client-id',
          durationMs: 10,
          isCorrect: false,
          submittedAt,
        },
      ],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(fake.selectCalls[1]?.from).toBe(questionAttempts);
    expect(fake.selectCalls[1]?.joins).toHaveLength(0);
    expect(
      fake.selectCalls[1]?.orderBy.map((order) => toSql(order).sql),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('submitted_at" desc'),
        expect.stringContaining('"question_attempts"."id" desc'),
      ]),
    );
  });
});

const integrationDatabaseUrl =
  process.env.LEARNER_QUESTION_QUERY_TEST_DATABASE_URL;

const ids = {
  user: '10000000-0000-4000-8000-000000000001',
  media: '20000000-0000-4000-8000-000000000001',
  word: '30000000-0000-4000-8000-000000000001',
  expression: '30000000-0000-4000-8000-000000000002',
  meaning: '30000000-0000-4000-8000-000000000003',
  pronunciation: '30000000-0000-4000-8000-000000000004',
  sentence: '40000000-0000-4000-8000-000000000001',
  sentenceVersion: '40000000-0000-4000-8000-000000000002',
  readingType: '50000000-0000-4000-8000-000000000001',
  listeningType: '50000000-0000-4000-8000-000000000002',
  readingTypeVersion: '50000000-0000-4000-8000-000000000003',
  listeningTypeVersion: '50000000-0000-4000-8000-000000000004',
  topic: '50000000-0000-4000-8000-000000000005',
  unavailableTopics: [
    '50000000-0000-4000-8000-000000000008',
    '50000000-0000-4000-8000-000000000009',
    '50000000-0000-4000-8000-000000000010',
  ],
  unavailableType: '50000000-0000-4000-8000-000000000011',
  unavailableTypeVersion: '50000000-0000-4000-8000-000000000012',
  tags: [
    '50000000-0000-4000-8000-000000000006',
    '50000000-0000-4000-8000-000000000007',
  ],
  unavailableTags: [
    '50000000-0000-4000-8000-000000000013',
    '50000000-0000-4000-8000-000000000014',
    '50000000-0000-4000-8000-000000000015',
  ],
  questions: [
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000003',
    '60000000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000005',
    '60000000-0000-4000-8000-000000000006',
  ],
  versions: [
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000005',
    '70000000-0000-4000-8000-000000000006',
    '70000000-0000-4000-8000-000000000007',
    '70000000-0000-4000-8000-000000000008',
  ],
  options: [
    '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000003',
    '80000000-0000-4000-8000-000000000004',
    '80000000-0000-4000-8000-000000000005',
  ],
  attempts: [
    '90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000002',
    '90000000-0000-4000-8000-000000000003',
  ],
  blocks: [
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000004',
  ],
} as const;

const createQuestionQueryFixture = async (pool: Pool): Promise<void> => {
  const sha256 = 'a'.repeat(64);
  await pool.query(
    `insert into users (id, cognito_sub, email, status)
     values ($1, 'query-user', 'query-user@example.com', 'ACTIVE')`,
    [ids.user],
  );
  await pool.query(
    `insert into media_assets (
       id, storage_key, declared_mime_type, declared_size_bytes,
       declared_sha256, mime_type, size_bytes, sha256, status, ready_at
     ) values ($1, 'private/sentence.mp3', 'audio/mpeg', 1, $2,
               'audio/mpeg', 1, $2, 'READY', now())`,
    [ids.media, sha256],
  );
  await pool.query(
    `insert into vocabularies (id, thai, normalized_thai, kind, status)
     values ($1, 'ดี', 'ดี', 'WORD', 'PUBLISHED'),
            ($2, 'สวัสดีครับ', 'สวัสดีครับ', 'EXPRESSION', 'PUBLISHED')`,
    [ids.word, ids.expression],
  );
  await pool.query(
    `insert into vocabulary_meanings
       (id, vocabulary_id, meaning_ko, part_of_speech, difficulty)
     values ($1, $2, '좋다', '형용사', 2)`,
    [ids.meaning, ids.word],
  );
  await pool.query(
    `insert into vocabulary_pronunciations
       (id, vocabulary_id, pronunciation_ko, tone_marks)
     values ($1, $2, '디', '-')`,
    [ids.pronunciation, ids.word],
  );
  await pool.query(`insert into thai_sentences (id) values ($1)`, [
    ids.sentence,
  ]);
  await pool.query(
    `insert into thai_sentence_versions (
       id, sentence_id, version, original_text, translation_ko,
       pronunciation_ko, tone_marks, media_asset_id, frozen_at
     ) values ($1, $2, 1, 'สวัสดีครับ', '안녕하세요', '싸왓디 크랍', '-', $3, now())`,
    [ids.sentenceVersion, ids.sentence, ids.media],
  );
  await pool.query(
    `insert into token_occurrences (
       sentence_version_id, position, surface, start_offset, end_offset,
       vocabulary_id, meaning_id, pronunciation_id, context_meaning_ko, role
     ) values ($1, 0, 'ดี', 0, 2, $2, $3, $4, '좋다', 'TARGET')`,
    [ids.sentenceVersion, ids.word, ids.meaning, ids.pronunciation],
  );
  await pool.query(
    `insert into expression_occurrences (
       sentence_version_id, start_token_index, end_token_index,
       vocabulary_id, vocabulary_kind, representative
     ) values ($1, 0, 2, $2, 'EXPRESSION', true)`,
    [ids.sentenceVersion, ids.expression],
  );
  await pool.query(
    `insert into question_topics (id, slug, display_name)
     values ($1, 'query-topic', '조회 주제'),
            ($2, 'invalidated-topic', '무효화 주제'),
            ($3, 'hidden-topic', '숨김 주제'),
            ($4, 'draft-topic', '초안 주제')`,
    [ids.topic, ...ids.unavailableTopics],
  );
  await pool.query(
    `insert into question_tags (id, slug, display_name)
     values ($1, 'grammar', '문법'), ($2, 'vocabulary', '어휘'),
            ($3, 'invalidated', '무효화 태그'),
            ($4, 'hidden', '숨김 태그'),
            ($5, 'draft', '초안 태그')`,
    [...ids.tags, ...ids.unavailableTags],
  );
  await pool.query(
    `insert into question_types (id, slug, display_name, skill, major_category)
     values ($1, 'reading-choice-query', '독해 선택', 'READING', 'READING_PASSAGE'),
            ($2, 'listening-choice-query', '듣기 선택', 'LISTENING', 'LISTENING_DIALOGUE'),
            ($3, 'unavailable-choice-query', '비공개 선택', 'READING', 'READING_ERROR_IDENTIFICATION')`,
    [ids.readingType, ids.listeningType, ids.unavailableType],
  );
  await pool.query(
    `insert into question_type_versions (
       id, question_type_id, version, template, option_count, decision_rules
     ) values ($1, $2, 1, 'STANDARD_CHOICE', 2, '{}'),
              ($3, $4, 1, 'DIALOGUE_CHOICE', 2, '{}'),
              ($5, $6, 1, 'INLINE_SPAN_CHOICE', 2, '{}')`,
    [
      ids.readingTypeVersion,
      ids.readingType,
      ids.listeningTypeVersion,
      ids.listeningType,
      ids.unavailableTypeVersion,
      ids.unavailableType,
    ],
  );
  await pool.query(
    `insert into questions (id, status)
     values ($1, 'PUBLISHED'), ($2, 'PUBLISHED'), ($3, 'PUBLISHED'),
            ($4, 'PUBLISHED'), ($5, 'HIDDEN'), ($6, 'DRAFT')`,
    [...ids.questions],
  );
  await pool.query(
    `insert into question_versions (
       id, question_id, version, type_version_id, topic_id, difficulty,
       status, validation_status, validation_issues, published_at
     ) values
       ($1, $9, 1, $15, $18, 3, 'RETIRED', 'PASSED', '[]', '2026-07-20T00:00:00Z'),
       ($2, $9, 2, $15, $18, 3, 'PUBLISHED', 'PASSED', '[]', '2026-07-21T00:00:00Z'),
       ($3, $10, 1, $16, $18, 2, 'PUBLISHED', 'PASSED', '[]', '2026-07-22T00:00:00Z'),
       ($4, $11, 1, $17, $19, 4, 'INVALIDATED', 'PASSED', '[]', '2026-07-22T12:00:00Z'),
       ($5, $11, 2, $15, $18, 4, 'PUBLISHED', 'PASSED', '[]', '2026-07-23T00:00:00Z'),
       ($6, $12, 1, $15, $18, 3, 'PUBLISHED', 'PASSED', '[]', '2026-07-23T00:00:00Z'),
       ($7, $13, 1, $17, $20, 3, 'PUBLISHED', 'PASSED', '[]', '2026-07-25T00:00:00Z'),
       ($8, $14, 1, $17, $21, 3, 'DRAFT', 'PENDING', '[]', null)`,
    [
      ...ids.versions,
      ...ids.questions,
      ids.readingTypeVersion,
      ids.listeningTypeVersion,
      ids.unavailableTypeVersion,
      ids.topic,
      ...ids.unavailableTopics,
    ],
  );
  await pool.query(
    `insert into question_version_tags (question_version_id, tag_id)
     values ($1, $4), ($1, $5), ($2, $5),
            ($3, $6), ($9, $7), ($10, $8)`,
    [
      ids.versions[1],
      ids.versions[2],
      ids.versions[3],
      ...ids.tags,
      ...ids.unavailableTags,
      ids.versions[6],
      ids.versions[7],
    ],
  );
  await pool.query(
    `update questions set current_published_version_id = case id
       when $1 then $7::uuid when $2 then $8::uuid when $3 then $9::uuid
       when $4 then $10::uuid when $5 then $11::uuid end
     where id = any($6::uuid[])`,
    [
      ids.questions[0],
      ids.questions[1],
      ids.questions[2],
      ids.questions[3],
      ids.questions[4],
      ids.questions.slice(0, 5),
      ids.versions[1],
      ids.versions[2],
      ids.versions[4],
      ids.versions[5],
      ids.versions[6],
    ],
  );
  await pool.query(
    `insert into question_options
       (id, question_version_id, sentence_version_id, position, is_correct)
     values ($1, $6, $10, 0, true),
            ($2, $7, $10, 1, false),
            ($3, $7, $10, 0, true),
            ($4, $8, $10, 0, false),
            ($5, $9, $10, 0, true)`,
    [
      ...ids.options,
      ids.versions[0],
      ids.versions[1],
      ids.versions[2],
      ids.versions[3],
      ids.sentenceVersion,
    ],
  );
  await pool.query(
    `insert into question_blocks
       (id, question_version_id, kind, display_mode, position)
     values ($1, $5, 'QUESTION', 'TEXT', 2),
            ($2, $5, 'INSTRUCTION', 'TEXT_AND_AUDIO', 0),
            ($3, $5, 'EXPLANATION', 'TEXT', 3),
            ($4, $6, 'EXPLANATION', 'TEXT', 1)`,
    [...ids.blocks, ids.versions[1], ids.versions[0]],
  );
  await pool.query(
    `insert into question_block_sentences
       (block_id, sentence_version_id, position, speaker)
     values ($1, $5, 1, null), ($2, $5, 0, 'A'),
            ($3, $5, 0, null), ($4, $5, 0, null)`,
    [...ids.blocks, ids.sentenceVersion],
  );
  await pool.query(
    `insert into question_attempts (
       id, user_id, question_id, question_version_id, attempt_no,
       selected_option_id, client_attempt_id, duration_ms, is_correct, submitted_at
     ) values
       ($1, $4, $5, $8, 1, $11, $14, 100, true, '2026-07-24T00:00:00Z'),
       ($2, $4, $6, $9, 1, $12, $15, 200, false, '2026-07-24T01:00:00Z'),
       ($3, $4, $7, $10, 1, $13, $16, 300, true, '2026-07-24T01:00:00Z')`,
    [
      ...ids.attempts,
      ids.user,
      ids.questions[0],
      ids.questions[1],
      ids.questions[2],
      ids.versions[0],
      ids.versions[2],
      ids.versions[3],
      ids.options[0],
      ids.options[3],
      ids.options[4],
      'b0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
      'b0000000-0000-4000-8000-000000000003',
    ],
  );
  await pool.query(
    `insert into saved_questions (user_id, question_id, saved_at)
     values ($1, $2, now())`,
    [ids.user, ids.questions[0]],
  );
};

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleLearnerQuestionQuery PostgreSQL 16 projection',
  () => {
    let pool: Pool;
    let query: DrizzleLearnerQuestionQuery;

    beforeAll(async () => {
      if (!integrationDatabaseUrl) {
        throw new Error('LEARNER_QUESTION_QUERY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
      await createQuestionQueryFixture(pool);
      query = new DrizzleLearnerQuestionQuery(
        drizzle({ client: pool, schema }),
      );
    });

    afterAll(async () => {
      await pool.end();
    });

    it('게시·저장·skill·type·difficulty와 first result를 중복 없이 필터한다', async () => {
      const all = await query.listQuestions(ids.user, {
        sort: 'LATEST',
        page: 1,
        pageSize: 2,
      });
      expect(all.page).toEqual({
        page: 1,
        pageSize: 2,
        totalItems: 4,
        totalPages: 2,
      });
      expect(all.items.map((item) => item.questionId)).toEqual([
        ids.questions[3],
        ids.questions[2],
      ]);
      expect(all.items.map((item) => item.firstResult)).toEqual([
        'UNANSWERED',
        'UNANSWERED',
      ]);
      expect(all.items[1]).toMatchObject({
        majorCategory: 'READING_PASSAGE',
        topic: { id: ids.topic, slug: 'query-topic' },
        tags: [{ id: ids.tags[1], slug: 'vocabulary' }],
      });

      await expect(
        query.listQuestions(ids.user, {
          saved: true,
          skill: 'READING',
          questionTypeId: ids.readingType,
          difficulty: 3,
          firstResult: 'CORRECT',
          sort: 'LATEST',
          page: 1,
          pageSize: 20,
        }),
      ).resolves.toMatchObject({
        items: [
          {
            questionId: ids.questions[0],
            saved: true,
            firstResult: 'CORRECT',
          },
        ],
        page: { totalItems: 1 },
      });

      const unanswered = await query.listQuestions(ids.user, {
        firstResult: 'UNANSWERED',
        saved: false,
        sort: 'LATEST',
        page: 1,
        pageSize: 20,
      });
      expect(unanswered.items.map((item) => item.questionId)).toEqual([
        ids.questions[3],
        ids.questions[2],
      ]);
    });

    it('현재 공개 taxonomy facet만 중복 없이 안정 순서로 반환한다', async () => {
      const facets = await query.listQuestionFacets();

      expect(facets.majorCategories).toEqual([
        { value: 'LISTENING_DIALOGUE', label: '대화문' },
        { value: 'READING_PASSAGE', label: '지문 독해' },
      ]);
      expect(facets.questionTypes).toEqual([
        {
          id: ids.readingType,
          slug: 'reading-choice-query',
          displayName: '독해 선택',
          majorCategory: 'READING_PASSAGE',
        },
        {
          id: ids.listeningType,
          slug: 'listening-choice-query',
          displayName: '듣기 선택',
          majorCategory: 'LISTENING_DIALOGUE',
        },
      ]);
      expect(facets.topics).toEqual([
        { id: ids.topic, slug: 'query-topic', displayName: '조회 주제' },
      ]);
      expect(facets.tags).toEqual([
        { id: ids.tags[0], slug: 'grammar', displayName: '문법' },
        { id: ids.tags[1], slug: 'vocabulary', displayName: '어휘' },
      ]);
      expect(JSON.stringify(facets)).not.toContain(ids.unavailableType);
      for (const topicId of ids.unavailableTopics) {
        expect(JSON.stringify(facets)).not.toContain(topicId);
      }
      for (const tagId of ids.unavailableTags) {
        expect(JSON.stringify(facets)).not.toContain(tagId);
      }
    });

    it('동일 publishedAt 문제도 question ID 내림차순으로 페이지 경계를 고정한다', async () => {
      const first = await query.listQuestions(ids.user, {
        sort: 'LATEST',
        page: 1,
        pageSize: 1,
      });
      const second = await query.listQuestions(ids.user, {
        sort: 'LATEST',
        page: 2,
        pageSize: 1,
      });

      expect(first.items.map((item) => item.questionId)).toEqual([
        ids.questions[3],
      ]);
      expect(second.items.map((item) => item.questionId)).toEqual([
        ids.questions[2],
      ]);
    });

    it('현재 공개 상세만 순서대로 조립하고 정답·해설·검증을 노출하지 않는다', async () => {
      const detail = await query.getQuestionDetail(ids.user, ids.questions[0]);

      expect(detail?.blocks.map((block) => block.position)).toEqual([0, 2]);
      expect(detail?.options.map((option) => option.position)).toEqual([0, 1]);
      expect(detail?.blocks[0]?.sentences[0]?.sentence).toBe(
        detail?.options[0]?.sentence,
      );
      expect(detail?.blocks[0]?.sentences[0]?.sentence.media.storageKey).toBe(
        'private/sentence.mp3',
      );
      const serialized = JSON.stringify(detail);
      expect(serialized).not.toContain('isCorrect');
      expect(serialized).not.toContain('validation');
      expect(serialized).not.toContain('EXPLANATION');

      await expect(
        query.getQuestionDetail(ids.user, ids.questions[4]),
      ).resolves.toBeNull();
      await expect(
        query.getQuestionDetail(ids.user, ids.questions[5]),
      ).resolves.toBeNull();
    });

    it('퇴역 historical version의 해설을 current 제한 없이 조회한다', async () => {
      const explanation = await query.getExplanation(ids.versions[0]);

      expect(explanation).toHaveLength(1);
      expect(explanation[0]?.kind).toBe('EXPLANATION');
      expect(JSON.stringify(explanation)).not.toContain('isCorrect');
    });

    it('무효화 기록을 포함해 submittedAt DESC와 ID tie-breaker로 보존한다', async () => {
      const attempts = await query.listAttempts(ids.user, {
        page: 1,
        pageSize: 20,
      });

      expect(attempts.items.map((attempt) => attempt.id)).toEqual([
        ids.attempts[2],
        ids.attempts[1],
        ids.attempts[0],
      ]);
      expect(attempts.page.totalItems).toBe(3);
    });
  },
);
