/** canonical 콘텐츠 draft의 insert 순서·오류 변환·transaction 경계를 고정한다 */
import { DatabaseErrorException } from '@aws-sdk/client-rds-data';
import type {
  ContentDraftTransaction,
  ResolvedContentDraftAudit,
  ResolvedContentImportItem,
  ResolvedQuestionDraftGraph,
  ResolvedVocabularyDraftGraph,
} from '@flex-thia/domain/content-import/content-draft.repository';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it, vi } from 'vitest';
import { contentImportItems } from '../schema/content-import.schema.js';
import { auditLogs } from '../schema/identity.schema.js';
import {
  questions,
  questionTypeVersions,
  questionVocabularies,
} from '../schema/questions.schema.js';
import {
  vocabularies,
  vocabularyMeanings,
} from '../schema/vocabulary.schema.js';
import {
  ContentDraftPersistenceError,
  DrizzleContentDraftRepository,
} from './drizzle-content-draft.repository.js';

interface InsertCall {
  table: unknown;
  values: unknown;
}

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  import: '00000000-0000-4000-8000-000000000002',
  item: '00000000-0000-4000-8000-000000000003',
  vocabulary: '00000000-0000-4000-8000-000000000005',
  meaning: '00000000-0000-4000-8000-000000000006',
  pronunciation: '00000000-0000-4000-8000-000000000007',
  expression: '00000000-0000-4000-8000-000000000008',
  question: '00000000-0000-4000-8000-000000000009',
  questionVersion: '00000000-0000-4000-8000-000000000010',
  questionType: '00000000-0000-4000-8000-000000000011',
  questionTypeVersion: '00000000-0000-4000-8000-000000000012',
  block: '00000000-0000-4000-8000-000000000013',
  blockSentence: '00000000-0000-4000-8000-000000000014',
  blockThaiSentence: '00000000-0000-4000-8000-000000000015',
  blockThaiSentenceVersion: '00000000-0000-4000-8000-000000000016',
  token: '00000000-0000-4000-8000-000000000017',
  expressionOccurrence: '00000000-0000-4000-8000-000000000018',
  optionOne: '00000000-0000-4000-8000-000000000019',
  optionTwo: '00000000-0000-4000-8000-000000000020',
  optionOneSentence: '00000000-0000-4000-8000-000000000021',
  optionOneSentenceVersion: '00000000-0000-4000-8000-000000000022',
  optionTwoSentence: '00000000-0000-4000-8000-000000000023',
  optionTwoSentenceVersion: '00000000-0000-4000-8000-000000000024',
} as const;

const vocabularyGraph: ResolvedVocabularyDraftGraph = {
  vocabulary: {
    id: ids.vocabulary,
    thai: 'สวัสดี',
    normalizedThai: 'สวัสดี',
    kind: 'WORD',
    status: 'DRAFT',
  },
  meanings: [
    {
      id: ids.meaning,
      vocabularyId: ids.vocabulary,
      meaningKo: '안녕하세요',
      partOfSpeech: '감탄사',
      difficulty: 1,
      contextNote: null,
    },
  ],
  pronunciations: [
    {
      id: ids.pronunciation,
      vocabularyId: ids.vocabulary,
      pronunciationKo: '싸왓디',
      toneMarks: 'LHL',
    },
  ],
  meaningPronunciations: [
    {
      vocabularyId: ids.vocabulary,
      meaningId: ids.meaning,
      pronunciationId: ids.pronunciation,
    },
  ],
};

const vocabularyItem: ResolvedContentImportItem = {
  id: ids.item,
  importId: ids.import,
  kind: 'VOCABULARY',
  sourceIndex: 0,
  clientRef: 'vocabulary-ref',
  status: 'IMPORTED',
  targetId: ids.vocabulary,
  errors: [],
  referenceMap: Object.fromEntries([
    ['vocabulary-ref', ids.vocabulary],
    ['__proto__', ids.meaning],
    ['pronunciation-ref', ids.pronunciation],
  ]),
};

const vocabularyAudit: ResolvedContentDraftAudit = {
  actorSub: 'cognito-sub',
  actorUserId: ids.actor,
  requestId: 'request-id',
  occurredAt: new Date('2026-07-24T00:00:00.000Z'),
  action: 'CONTENT_VOCABULARY_DRAFT_IMPORTED',
  targetType: 'VOCABULARY',
  targetId: ids.vocabulary,
  summary: {
    importId: ids.import,
    sourceIndex: 0,
  },
};

const questionGraph: ResolvedQuestionDraftGraph = {
  question: {
    id: ids.question,
    status: 'DRAFT',
    currentPublishedVersionId: null,
  },
  version: {
    id: ids.questionVersion,
    questionId: ids.question,
    version: 1,
    typeVersionId: ids.questionTypeVersion,
    topicId: ids.vocabulary,
    difficulty: 2,
    status: 'DRAFT',
    validationStatus: 'PENDING',
    validationIssues: [],
    validatedAt: null,
    publishedAt: null,
  },
  tagIds: [],
  sentences: [
    {
      sentence: { id: ids.blockThaiSentence },
      version: {
        id: ids.blockThaiSentenceVersion,
        sentenceId: ids.blockThaiSentence,
        version: 1,
        originalText: 'ก',
        translationKo: '질문',
        pronunciationKo: '꺼',
        toneMarks: '-',
        frozenAt: null,
      },
      tokens: [
        {
          id: ids.token,
          sentenceVersionId: ids.blockThaiSentenceVersion,
          position: 0,
          surface: 'ก',
          startOffset: 0,
          endOffset: 1,
          vocabularyId: ids.vocabulary,
          meaningId: ids.meaning,
          pronunciationId: ids.pronunciation,
          contextMeaningKo: '질문',
          role: 'TARGET',
        },
      ],
      expressions: [
        {
          id: ids.expressionOccurrence,
          sentenceVersionId: ids.blockThaiSentenceVersion,
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabularyId: ids.expression,
          vocabularyKind: 'EXPRESSION',
          meaningId: ids.meaning,
          pronunciationId: ids.pronunciation,
          contextMeaningKo: '질문 표현',
          representative: true,
        },
      ],
    },
    {
      sentence: { id: ids.optionOneSentence },
      version: {
        id: ids.optionOneSentenceVersion,
        sentenceId: ids.optionOneSentence,
        version: 1,
        originalText: 'ข',
        translationKo: '오답',
        pronunciationKo: '커',
        toneMarks: '-',
        frozenAt: null,
      },
      tokens: [],
      expressions: [],
    },
    {
      sentence: { id: ids.optionTwoSentence },
      version: {
        id: ids.optionTwoSentenceVersion,
        sentenceId: ids.optionTwoSentence,
        version: 1,
        originalText: 'ค',
        translationKo: '정답',
        pronunciationKo: '커',
        toneMarks: '-',
        frozenAt: null,
      },
      tokens: [],
      expressions: [],
    },
  ],
  blocks: [
    {
      id: ids.block,
      questionVersionId: ids.questionVersion,
      kind: 'QUESTION',
      position: 0,
      sentences: [
        {
          id: ids.blockSentence,
          blockId: ids.block,
          sentenceVersionId: ids.blockThaiSentenceVersion,
          position: 0,
          speaker: null,
        },
      ],
    },
  ],
  options: [
    {
      id: ids.optionOne,
      questionVersionId: ids.questionVersion,
      sentenceVersionId: ids.optionOneSentenceVersion,
      position: 0,
      isCorrect: false,
      spanSentenceVersionId: null,
      spanStartTokenIndex: null,
      spanEndTokenIndex: null,
    },
    {
      id: ids.optionTwo,
      questionVersionId: ids.questionVersion,
      sentenceVersionId: ids.optionTwoSentenceVersion,
      position: 1,
      isCorrect: true,
      spanSentenceVersionId: null,
      spanStartTokenIndex: null,
      spanEndTokenIndex: null,
    },
  ],
};

const questionItem: ResolvedContentImportItem = {
  id: ids.item,
  importId: ids.import,
  kind: 'QUESTION',
  sourceIndex: 0,
  clientRef: 'question-ref',
  status: 'IMPORTED',
  targetId: ids.question,
  errors: [],
  referenceMap: Object.fromEntries([
    ['question-ref', ids.question],
    ['__proto__', ids.optionOne],
    ['option-two', ids.optionTwo],
  ]),
};

const questionAudit: ResolvedContentDraftAudit = {
  ...vocabularyAudit,
  action: 'CONTENT_QUESTION_DRAFT_IMPORTED',
  targetType: 'QUESTION',
  targetId: ids.question,
};

type DataApiConstraintKind = 'check' | 'foreign key' | 'unique';

interface DataApiQueryErrorOptions {
  constraint: string | null;
  constraintKind: DataApiConstraintKind | null;
  detail?: string;
  messageOverride?: string | undefined;
  sqlState: string | null;
}

const createDataApiQueryError = ({
  sqlState,
  constraint,
  constraintKind,
  detail = 'simulated private detail',
  messageOverride,
}: DataApiQueryErrorOptions): DrizzleQueryError => {
  const header =
    constraint === null || constraintKind === null
      ? 'ERROR: simulated Data API database failure'
      : constraintKind === 'unique'
        ? `ERROR: duplicate key value violates unique constraint "${constraint}"`
        : constraintKind === 'foreign key'
          ? `ERROR: insert or update on table "content" violates foreign key constraint "${constraint}"`
          : `ERROR: new row for relation "content" violates check constraint "${constraint}"`;
  const message =
    messageOverride ??
    [
      header,
      `Detail: ${detail}`,
      sqlState === null ? null : `SQLState: ${sqlState}`,
    ]
      .filter((part): part is string => part !== null)
      .join('; ');
  const cause = new DatabaseErrorException({
    message,
    $metadata: {},
  });
  return new DrizzleQueryError(
    'insert into private_table values ($1)',
    ['private-param'],
    cause,
  );
};

const createFakeDatabase = (failure?: { table: unknown; error: unknown }) => {
  const inserts: InsertCall[] = [];
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((values: unknown) => {
      inserts.push({ table, values });
      const currentFailure = failure;
      if (currentFailure && currentFailure.table === table) {
        const rejection =
          currentFailure.error instanceof Error
            ? currentFailure.error
            : Object.assign(new Error('fake database failure'), {
                ...(typeof currentFailure.error === 'object' &&
                currentFailure.error !== null
                  ? currentFailure.error
                  : {}),
              });
        return Promise.reject(rejection);
      }
      return Promise.resolve();
    }),
  }));
  const transactionValue = { insert };
  const database = {
    transaction: vi.fn(
      <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
        work(transactionValue),
    ),
  };
  return { database, inserts };
};

const createLookupDatabase = (
  selectResults: Array<Array<Record<string, unknown>>>,
) => {
  const results = [...selectResults];
  const lockModes: unknown[] = [];
  const selectedTables: unknown[] = [];
  const select = vi.fn(() => {
    const chain = {
      from: vi.fn((table: unknown) => {
        selectedTables.push(table);
        return chain;
      }),
      innerJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      for: vi.fn((mode: unknown) => {
        lockModes.push(mode);
        return chain;
      }),
      limit: vi.fn(() => Promise.resolve(results.shift() ?? [])),
    };
    chain.innerJoin.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    return chain;
  });
  const transactionValue = { select };
  const database = {
    transaction: vi.fn(
      <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
        work(transactionValue),
    ),
  };
  return { database, lockModes, selectedTables };
};

const saveVocabulary = (
  repository: DrizzleContentDraftRepository,
): Promise<void> =>
  repository.runInTransaction((transaction: ContentDraftTransaction) =>
    transaction.saveVocabularyDraft({
      graph: vocabularyGraph,
      item: vocabularyItem,
      audit: vocabularyAudit,
    }),
  );

const saveQuestion = (
  repository: DrizzleContentDraftRepository,
  graph: ResolvedQuestionDraftGraph = questionGraph,
): Promise<void> =>
  repository.runInTransaction((transaction: ContentDraftTransaction) =>
    transaction.saveQuestionDraft({
      graph,
      item: questionItem,
      audit: questionAudit,
    }),
  );

describe('DrizzleContentDraftRepository 어휘 저장', () => {
  it('어휘 graph와 IMPORTED item·audit을 FK 순서대로 같은 transaction에 저장한다', async () => {
    const fake = createFakeDatabase();
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    await saveVocabulary(repository);

    expect(fake.database.transaction).toHaveBeenCalledTimes(1);
    expect(fake.inserts.map(({ table }) => table)).toEqual([
      vocabularies,
      vocabularyMeanings,
      contentImportItems,
      auditLogs,
    ]);
    expect(fake.inserts[2]?.values).toMatchObject({
      referenceMap: vocabularyItem.referenceMap,
    });
    expect(
      Object.hasOwn(
        (fake.inserts[2]?.values as ResolvedContentImportItem).referenceMap,
        '__proto__',
      ),
    ).toBe(true);
    expect(fake.inserts[3]?.values).toMatchObject({
      actorSub: vocabularyAudit.actorSub,
      actorUserId: vocabularyAudit.actorUserId,
      action: vocabularyAudit.action,
      target: vocabularyAudit.targetId,
      targetType: vocabularyAudit.targetType,
      targetId: vocabularyAudit.targetId,
      summary: vocabularyAudit.summary,
      requestId: vocabularyAudit.requestId,
      createdAt: vocabularyAudit.occurredAt,
    });
  });

  it('동시 normalized unique 충돌을 stable duplicate 오류로 변환한다', async () => {
    const fake = createFakeDatabase({
      table: vocabularies,
      error: {
        code: '23505',
        constraint: 'vocabularies_normalized_thai_unique',
      },
    });
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    await expect(saveVocabulary(repository)).rejects.toMatchObject({
      code: 'IMPORT_DUPLICATE_VOCABULARY',
      path: 'thai',
    });
    expect(fake.inserts).toHaveLength(1);
  });

  it('동시 같은 import item 충돌을 stable persistence 오류로 변환한다', async () => {
    const fake = createFakeDatabase({
      table: contentImportItems,
      error: {
        code: '23505',
        constraint: 'content_import_items_import_kind_source_index_unique',
      },
    });
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    await expect(saveVocabulary(repository)).rejects.toMatchObject({
      code: 'CONTENT_DRAFT_ITEM_CONFLICT',
      operation: 'saveVocabularyDraft',
    });
    await expect(saveVocabulary(repository)).rejects.toBeInstanceOf(
      ContentDraftPersistenceError,
    );
  });

  it('audit insert 실패를 삼키지 않아 graph와 item transaction을 rollback 가능하게 한다', async () => {
    const auditFailure = new Error('audit failed');
    const fake = createFakeDatabase({
      table: auditLogs,
      error: auditFailure,
    });
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    await expect(saveVocabulary(repository)).rejects.toBe(auditFailure);
    expect(fake.database.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('DrizzleContentDraftRepository 문제 저장', () => {
  it('question·sentence·block·option graph와 item·audit을 FK 순서대로 저장한다', async () => {
    const fake = createFakeDatabase();
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    await saveQuestion(repository);

    expect(fake.database.transaction).toHaveBeenCalledTimes(1);
    expect(fake.inserts.map(({ table }) => table)).toEqual([
      questions,
      questionVocabularies,
      contentImportItems,
      auditLogs,
    ]);
    expect(fake.inserts[0]?.values).toMatchObject({
      id: ids.question,
      correctOptionId: ids.optionTwo,
      version: 1,
    });
    expect(fake.inserts[3]?.values).toMatchObject({
      action: questionAudit.action,
      targetType: 'QUESTION',
      targetId: ids.question,
    });
  });

  it('정답 option이 정확히 하나가 아니면 insert 전에 stable persistence 오류로 거절한다', async () => {
    const fake = createFakeDatabase();
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );
    const graph = {
      ...questionGraph,
      options: questionGraph.options.map((option) => ({
        ...option,
        isCorrect: false,
      })),
    };

    await expect(saveQuestion(repository, graph)).rejects.toMatchObject({
      code: 'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
      operation: 'saveQuestionDraft.correctOptionCount',
    });
    expect(fake.inserts).toEqual([]);
  });

  it('성공한 같은 import map과 current vocabulary 소유·type version을 transaction 안에서 조회한다', async () => {
    const referenceMap = Object.fromEntries([
      ['word-ref', ids.vocabulary],
      ['__proto__', ids.meaning],
      ['pronunciation-ref', ids.pronunciation],
    ]);
    const fake = createLookupDatabase([
      [
        {
          itemId: ids.item,
          clientRef: 'word-ref',
          targetId: ids.vocabulary,
          referenceMap,
        },
      ],
      [{ id: ids.vocabulary, kind: 'WORD', status: 'DRAFT' }],
      [{ id: ids.meaning, vocabularyId: ids.vocabulary }],
      [
        {
          id: ids.pronunciation,
          vocabularyId: ids.vocabulary,
        },
      ],
      [
        {
          id: ids.questionTypeVersion,
          slug: 'standard-choice',
          version: 1,
          template: 'STANDARD_CHOICE',
          optionCount: 2,
        },
      ],
    ]);
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    const result = await repository.runInTransaction(async (transaction) => ({
      imported:
        await transaction.findSuccessfulVocabularyImportItemsByReference(
          ids.import,
          '__proto__',
        ),
      vocabulary: await transaction.findVocabularyById(ids.vocabulary),
      meaning: await transaction.findVocabularyMeaningById(ids.meaning),
      pronunciation: await transaction.findVocabularyPronunciationById(
        ids.pronunciation,
      ),
      typeVersion: await transaction.findQuestionTypeVersion(
        'standard-choice',
        1,
      ),
    }));

    expect(result.imported).toEqual([
      {
        itemId: ids.item,
        clientRef: 'word-ref',
        targetId: ids.vocabulary,
        referenceMap,
      },
    ]);
    expect(Object.hasOwn(result.imported[0]!.referenceMap, '__proto__')).toBe(
      true,
    );
    expect(result.vocabulary).toEqual({
      id: ids.vocabulary,
      kind: 'WORD',
      status: 'DRAFT',
    });
    expect(result.meaning).toEqual({
      id: ids.meaning,
      vocabularyId: ids.vocabulary,
    });
    expect(result.pronunciation).toEqual({
      id: ids.pronunciation,
      vocabularyId: ids.vocabulary,
    });
    expect(result.typeVersion).toEqual({
      id: ids.questionTypeVersion,
      slug: 'standard-choice',
      version: 1,
      template: 'STANDARD_CHOICE',
      optionCount: 2,
    });
    expect(fake.selectedTables).toEqual([
      contentImportItems,
      vocabularies,
      vocabularyMeanings,
      vocabularyMeanings,
      questionTypeVersions,
    ]);
    expect(fake.lockModes).toEqual([
      'key share',
      'key share',
      'key share',
      'key share',
      'key share',
    ]);
  });

  it.each([
    {
      table: questions,
      constraint: 'questions_type_version_id_question_type_versions_id_fk',
      code: 'IMPORT_QUESTION_TYPE_NOT_FOUND',
      path: 'questionTypeSlug',
    },
    {
      table: questionVocabularies,
      constraint: 'question_vocabularies_vocabulary_id_vocabularies_id_fk',
      code: 'IMPORT_REFERENCE_NOT_FOUND',
      path: 'sentences.tokens.vocabulary',
    },
    {
      table: questionVocabularies,
      constraint: 'question_vocabularies_meaning_owner_fk',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.tokens',
    },
    {
      table: questionVocabularies,
      constraint: 'question_vocabularies_meaning_owner_fk',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.tokens',
    },
    {
      table: questionVocabularies,
      constraint: 'expression_occurrences_vocabulary_kind_fk',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.expressions',
    },
  ])(
    '저장 직전 사라지거나 소유가 바뀐 $constraint 참조를 stable 오류로 변환한다',
    async ({ table, constraint, code, path }) => {
      const fake = createFakeDatabase({
        table,
        error: { code: '23503', constraint },
      });
      const repository = new DrizzleContentDraftRepository(
        fake.database as never,
      );

      await expect(saveQuestion(repository)).rejects.toMatchObject({
        code,
        path,
      });
    },
  );

  it('동시 같은 question item 충돌을 graph 중복이 아닌 stable persistence 오류로 반환한다', async () => {
    const fake = createFakeDatabase({
      table: contentImportItems,
      error: {
        code: '23505',
        constraint: 'content_import_items_import_kind_source_index_unique',
      },
    });
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    await expect(saveQuestion(repository)).rejects.toMatchObject({
      code: 'CONTENT_DRAFT_ITEM_CONFLICT',
      operation: 'saveQuestionDraft',
    });
  });
});

describe('DrizzleContentDraftRepository Aurora Data API 오류 변환', () => {
  it.each([
    {
      table: vocabularies,
      saveKind: 'VOCABULARY',
      sqlState: '23505',
      constraint: 'vocabularies_normalized_thai_unique',
      constraintKind: 'unique',
      code: 'IMPORT_DUPLICATE_VOCABULARY',
      path: 'thai',
    },
    {
      table: contentImportItems,
      saveKind: 'VOCABULARY',
      sqlState: '23505',
      constraint: 'content_import_items_import_kind_source_index_unique',
      constraintKind: 'unique',
      code: 'CONTENT_DRAFT_ITEM_CONFLICT',
      operation: 'saveVocabularyDraft',
    },
    {
      table: questionVocabularies,
      saveKind: 'QUESTION',
      sqlState: '23503',
      constraint: 'question_vocabularies_meaning_owner_fk',
      constraintKind: 'foreign key',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.tokens',
    },
    {
      table: questionVocabularies,
      saveKind: 'QUESTION',
      sqlState: '23514',
      constraint: 'expression_occurrences_vocabulary_kind_expression',
      constraintKind: 'check',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.expressions',
    },
  ] as const)(
    '$constraint DatabaseErrorException을 stable 오류로 변환한다',
    async ({
      table,
      saveKind,
      sqlState,
      constraint,
      constraintKind,
      code,
      ...expected
    }) => {
      const fake = createFakeDatabase({
        table,
        error: createDataApiQueryError({
          sqlState,
          constraint,
          constraintKind,
        }),
      });
      const repository = new DrizzleContentDraftRepository(
        fake.database as never,
      );

      await expect(
        saveKind === 'VOCABULARY'
          ? saveVocabulary(repository)
          : saveQuestion(repository),
      ).rejects.toMatchObject({
        code,
        ...expected,
      });
    },
  );

  it.each([
    {
      sqlState: '23505',
      constraint: 'unknown_private_unique',
      constraintKind: 'unique',
      messageOverride: undefined,
    },
    {
      sqlState: '22000',
      constraint: 'vocabularies_normalized_thai_unique',
      constraintKind: 'unique',
      messageOverride: undefined,
    },
    {
      sqlState: null,
      constraint: null,
      constraintKind: null,
      messageOverride: 'unstructured private database failure',
    },
  ] as const)(
    'unknown Data API message를 SQL·params 없이 generic persistence 오류로 감춘다',
    async ({ sqlState, constraint, constraintKind, messageOverride }) => {
      const fake = createFakeDatabase({
        table: vocabularies,
        error: createDataApiQueryError({
          sqlState,
          constraint,
          constraintKind,
          messageOverride,
        }),
      });
      const repository = new DrizzleContentDraftRepository(
        fake.database as never,
      );

      const failure = await saveVocabulary(repository).catch(
        (error: unknown) => error,
      );

      expect(failure).toMatchObject({
        code: 'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        operation: 'saveVocabularyDraft',
        message: 'CONTENT_DRAFT_PERSISTENCE_CONFLICT:saveVocabularyDraft',
      });
      expect(String(failure)).not.toContain('private_table');
      expect(String(failure)).not.toContain('private-param');
      expect(String(failure)).not.toContain('unknown_private_unique');
      expect(String(failure)).not.toContain('unstructured private');
    },
  );

  it.each([
    {
      table: vocabularies,
      saveKind: 'VOCABULARY',
      sqlState: '23505',
      constraintKind: 'unique',
      headerConstraint: 'unknown_private_unique',
      detailConstraint: 'vocabularies_normalized_thai_unique',
      operation: 'saveVocabularyDraft',
    },
    {
      table: questionVocabularies,
      saveKind: 'QUESTION',
      sqlState: '23503',
      constraintKind: 'foreign key',
      headerConstraint: 'unknown_private_fk',
      detailConstraint: 'question_vocabularies_meaning_owner_fk',
      operation: 'saveQuestionDraft',
    },
    {
      table: questionVocabularies,
      saveKind: 'QUESTION',
      sqlState: '23514',
      constraintKind: 'check',
      headerConstraint: 'unknown_private_check',
      detailConstraint: 'expression_occurrences_vocabulary_kind_expression',
      operation: 'saveQuestionDraft',
    },
  ] as const)(
    '$constraintKind Detail의 known constraint 문자열을 specific 오류로 승격하지 않는다',
    async ({
      table,
      saveKind,
      sqlState,
      constraintKind,
      headerConstraint,
      detailConstraint,
      operation,
    }) => {
      const fake = createFakeDatabase({
        table,
        error: createDataApiQueryError({
          sqlState,
          constraint: headerConstraint,
          constraintKind,
          detail: `private input constraint "${detailConstraint}"`,
        }),
      });
      const repository = new DrizzleContentDraftRepository(
        fake.database as never,
      );

      const failure = await (
        saveKind === 'VOCABULARY'
          ? saveVocabulary(repository)
          : saveQuestion(repository)
      ).catch((error: unknown) => error);

      expect(failure).toMatchObject({
        code: 'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        operation,
        message: `CONTENT_DRAFT_PERSISTENCE_CONFLICT:${operation}`,
      });
      expect(String(failure)).not.toContain(headerConstraint);
      expect(String(failure)).not.toContain(detailConstraint);
    },
  );

  it.each([
    {
      table: vocabularies,
      saveKind: 'VOCABULARY',
      sqlState: '23505',
      constraintKind: 'foreign key',
      constraint: 'vocabularies_normalized_thai_unique',
      operation: 'saveVocabularyDraft',
    },
    {
      table: questionVocabularies,
      saveKind: 'QUESTION',
      sqlState: '23503',
      constraintKind: 'unique',
      constraint: 'question_vocabularies_meaning_owner_fk',
      operation: 'saveQuestionDraft',
    },
    {
      table: questionVocabularies,
      saveKind: 'QUESTION',
      sqlState: '23514',
      constraintKind: 'unique',
      constraint: 'expression_occurrences_vocabulary_kind_expression',
      operation: 'saveQuestionDraft',
    },
  ] as const)(
    '$sqlState와 $constraintKind 조합이 맞지 않으면 specific 오류로 승격하지 않는다',
    async ({
      table,
      saveKind,
      sqlState,
      constraintKind,
      constraint,
      operation,
    }) => {
      const fake = createFakeDatabase({
        table,
        error: createDataApiQueryError({
          sqlState,
          constraint,
          constraintKind,
        }),
      });
      const repository = new DrizzleContentDraftRepository(
        fake.database as never,
      );

      await expect(
        saveKind === 'VOCABULARY'
          ? saveVocabulary(repository)
          : saveQuestion(repository),
      ).rejects.toMatchObject({
        code: 'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
        operation,
      });
    },
  );
});
