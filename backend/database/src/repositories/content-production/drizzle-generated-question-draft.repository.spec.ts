/** 생성 문제 DRAFT adapter의 canonical 참조 검증과 graph insert 경계를 고정한다 */
import type { GeneratedQuestionPayload } from '@flex-thia/domain/content-production/ai-question-production';
import { describe, expect, it, vi } from 'vitest';
import {
  questionOptions,
  questions,
  questionTags,
  questionTopics,
  questionTypeVersions,
} from '../../schema/questions.schema.js';
import {
  vocabularies,
  vocabularyMeanings,
} from '../../schema/vocabulary.schema.js';
import { DrizzleGeneratedQuestionDraftRepository } from './drizzle-generated-question-draft.repository.js';

const IDS = {
  actor: '00000000-0000-4000-8000-000000000001',
  candidate: '00000000-0000-4000-8000-000000000002',
  typeVersion: '00000000-0000-4000-8000-000000000003',
  topic: '00000000-0000-4000-8000-000000000004',
  tag: '00000000-0000-4000-8000-000000000005',
  vocabulary: '00000000-0000-4000-8000-000000000006',
  meaning: '00000000-0000-4000-8000-000000000007',
  pronunciation: '00000000-0000-4000-8000-000000000008',
  vocabularyTwo: '00000000-0000-4000-8000-000000000009',
  meaningTwo: '00000000-0000-4000-8000-000000000010',
  pronunciationTwo: '00000000-0000-4000-8000-000000000011',
  expression: '00000000-0000-4000-8000-000000000012',
  expressionMeaning: '00000000-0000-4000-8000-000000000013',
  expressionPronunciation: '00000000-0000-4000-8000-000000000014',
} as const;

const generatedIds = Array.from(
  { length: 32 },
  (_, index) =>
    `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);

const sentence = {
  originalText: 'ภาษาไทย',
  translationKo: '태국어',
  pronunciationKo: '파싸 타이',
  toneMarks: '',
  tokens: [
    {
      surface: 'ภาษา',
      startOffset: 0,
      endOffset: 4,
      vocabulary: { id: IDS.vocabularyTwo },
      meaning: { id: IDS.meaningTwo },
      pronunciation: { id: IDS.meaningTwo },
      contextMeaningKo: '언어',
      role: 'SUPPORTING' as const,
    },
    {
      surface: 'ไทย',
      startOffset: 4,
      endOffset: 7,
      vocabulary: { id: IDS.vocabulary },
      meaning: { id: IDS.meaning },
      pronunciation: { id: IDS.meaning },
      contextMeaningKo: '태국',
      role: 'TARGET' as const,
    },
  ],
  expressions: [
    {
      startTokenIndex: 0,
      endTokenIndex: 2,
      vocabulary: { id: IDS.expression },
      meaning: { id: IDS.expressionMeaning },
      pronunciation: { id: IDS.expressionMeaning },
      contextMeaningKo: '태국어',
      representative: true,
    },
  ],
};

const payload: GeneratedQuestionPayload = {
  questionTypeSlug: 'reading-choice',
  questionTypeVersion: 1,
  difficulty: 3,
  topicSlug: 'general',
  tagSlugs: ['grammar'],
  blocks: [
    {
      kind: 'QUESTION',
      sentences: [{ speaker: null, sentence }],
    },
  ],
  options: [
    {
      clientRef: 'answer',
      position: 0,
      sentence,
      span: null,
    },
    {
      clientRef: 'distractor',
      position: 1,
      sentence,
      span: null,
    },
  ],
  correctOptionRef: 'answer',
};

type FakeOptions = {
  insertFailureTable?: unknown;
  meaningVocabularyId?: string;
  typeStatus?: 'ACTIVE' | 'DRAFT';
  vocabularyStatus?: 'HIDDEN' | 'PUBLISHED';
};

const createFake = (options: FakeOptions = {}) => {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const locks: Array<{ mode: string; table: unknown }> = [];
  const rows = new Map<unknown, unknown[]>([
    [
      questionTypeVersions,
      options.typeStatus === 'DRAFT'
        ? []
        : [
            {
              id: IDS.typeVersion,
              slug: 'reading-choice',
              version: 1,
              template: 'STANDARD_CHOICE',
              optionCount: 2,
            },
          ],
    ],
    [questionTopics, [{ id: IDS.topic, slug: 'general' }]],
    [questionTags, [{ id: IDS.tag, slug: 'grammar' }]],
    [
      vocabularies,
      [
        {
          id: IDS.vocabulary,
          kind: 'WORD',
          status: options.vocabularyStatus ?? 'PUBLISHED',
        },
        {
          id: IDS.vocabularyTwo,
          kind: 'WORD',
          status: options.vocabularyStatus ?? 'PUBLISHED',
        },
        {
          id: IDS.expression,
          kind: 'EXPRESSION',
          status: options.vocabularyStatus ?? 'PUBLISHED',
        },
      ],
    ],
    [
      vocabularyMeanings,
      [
        {
          id: IDS.meaning,
          vocabularyId: options.meaningVocabularyId ?? IDS.vocabulary,
        },
        { id: IDS.meaningTwo, vocabularyId: IDS.vocabularyTwo },
        { id: IDS.expressionMeaning, vocabularyId: IDS.expression },
      ],
    ],
  ]);

  const select = vi.fn((selection: unknown) => ({
    from: vi.fn((table: unknown) => {
      const selectedRows = rows.get(table) ?? [];
      const query: Record<string, unknown> & PromiseLike<unknown[]> = {
        innerJoin: vi.fn(() => query),
        where: vi.fn(() => query),
        orderBy: vi.fn(() => query),
        for: vi.fn((mode: string) => {
          locks.push({ mode, table });
          return query;
        }),
        limit: vi.fn(() => Promise.resolve(selectedRows)),
        then: (resolve, reject) =>
          Promise.resolve(selectedRows).then(resolve, reject),
      };
      return query;
    }),
    selection,
  }));
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((values: unknown) => {
      if (table === options.insertFailureTable) {
        return Promise.reject(new Error('insert failed'));
      }
      inserts.push({ table, values });
      return Promise.resolve();
    }),
  }));
  return {
    inserts,
    locks,
    transaction: { insert, select },
  };
};

const input = (candidatePayload: GeneratedQuestionPayload = payload) => ({
  candidate: {
    id: IDS.candidate,
    typeVersionId: IDS.typeVersion,
    topicId: IDS.topic,
    difficulty: 3,
    payload: candidatePayload,
  },
  actor: {
    actorUserId: IDS.actor,
    actorSub: 'admin-sub',
    requestId: 'request-1',
    occurredAt: new Date('2026-07-27T00:00:00.000Z'),
  },
});

const createRepository = () => {
  let index = 0;
  return new DrizzleGeneratedQuestionDraftRepository(
    () => generatedIds[index++]!,
  );
};

describe('Drizzle 생성 문제 DRAFT 저장소', () => {
  it('활성 상태와 canonical 참조를 비키 상태 전이까지 막는 SHARE로 잠근다', async () => {
    const fake = createFake();

    await createRepository().createDraft(fake.transaction as never, input());

    expect(fake.locks).toEqual([
      { mode: 'share', table: questionTypeVersions },
      { mode: 'share', table: questionTopics },
      { mode: 'share', table: questionTags },
      { mode: 'share', table: vocabularies },
      { mode: 'key share', table: vocabularyMeanings },
      { mode: 'key share', table: vocabularyMeanings },
    ]);
  });

  it('후보 ID와 일치하지 않는 유형·주제 payload는 쓰기 전에 거절한다', async () => {
    const fake = createFake();

    await expect(
      createRepository().createDraft(
        fake.transaction as never,
        input({ ...payload, difficulty: 4 }),
      ),
    ).rejects.toMatchObject({
      code: 'QUESTION_CANDIDATE_NOT_APPROVABLE',
    });
    expect(fake.inserts).toEqual([]);
  });

  it('저장 row의 malformed payload를 TypeError 대신 승인 불가로 거절한다', async () => {
    const fake = createFake();

    await expect(
      createRepository().createDraft(
        fake.transaction as never,
        input({ ...payload, blocks: null } as never),
      ),
    ).rejects.toMatchObject({
      code: 'QUESTION_CANDIDATE_NOT_APPROVABLE',
    });
    expect(fake.inserts).toEqual([]);
  });

  it('활성 유형이 아니거나 canonical 어휘 소유 관계가 틀리면 거절한다', async () => {
    const inactive = createFake({ typeStatus: 'DRAFT' });
    await expect(
      createRepository().createDraft(inactive.transaction as never, input()),
    ).rejects.toMatchObject({
      code: 'QUESTION_CANDIDATE_NOT_APPROVABLE',
    });
    expect(inactive.inserts).toEqual([]);

    const mismatch = createFake({
      meaningVocabularyId: '20000000-0000-4000-8000-000000000001',
    });
    await expect(
      createRepository().createDraft(mismatch.transaction as never, input()),
    ).rejects.toMatchObject({
      code: 'QUESTION_CANDIDATE_NOT_APPROVABLE',
    });
    expect(mismatch.inserts).toEqual([]);
  });

  it('게시 중이 아닌 canonical 어휘는 graph 쓰기 전에 거절한다', async () => {
    const fake = createFake({ vocabularyStatus: 'HIDDEN' });

    await expect(
      createRepository().createDraft(fake.transaction as never, input()),
    ).rejects.toMatchObject({
      code: 'QUESTION_CANDIDATE_NOT_APPROVABLE',
    });
    expect(fake.inserts).toEqual([]);
  });

  it('graph 중간 insert 실패를 삼키지 않아 outer transaction rollback을 유지한다', async () => {
    const fake = createFake({ insertFailureTable: questionOptions });

    await expect(
      createRepository().createDraft(fake.transaction as never, input()),
    ).rejects.toThrow('insert failed');
    expect(fake.inserts.some(({ table }) => table === questions)).toBe(true);
    expect(fake.inserts.some(({ table }) => table === questionOptions)).toBe(
      false,
    );
  });
});
