/** canonical 콘텐츠 draft의 insert 순서·오류 변환·transaction 경계를 고정한다 */
import { randomUUID } from 'node:crypto';
import { DatabaseErrorException } from '@aws-sdk/client-rds-data';
import type {
  ContentDraftTransaction,
  CreateQuestionDraftCommand,
  CreateVocabularyDraftCommand,
  ResolvedContentDraftAudit,
  ResolvedContentImportItem,
  ResolvedQuestionDraftGraph,
  ResolvedVocabularyDraftGraph,
} from '@flex-thia/domain';
import { ContentDraftService } from '@flex-thia/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  auditLogs,
  contentImportItems,
  expressionOccurrences,
  mediaAssets,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questions,
  questionTypeVersions,
  questionVersions,
  thaiSentences,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';
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
  media: '00000000-0000-4000-8000-000000000004',
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
      mediaAssetId: ids.media,
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
    difficulty: 2,
    status: 'DRAFT',
    validationStatus: 'PENDING',
    validationIssues: [],
    validatedAt: null,
    publishedAt: null,
  },
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
        mediaAssetId: ids.media,
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
        mediaAssetId: ids.media,
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
        mediaAssetId: ids.media,
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
      displayMode: 'TEXT_AND_AUDIO',
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
    },
    {
      id: ids.optionTwo,
      questionVersionId: ids.questionVersion,
      sentenceVersionId: ids.optionTwoSentenceVersion,
      position: 1,
      isCorrect: true,
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

const createDataApiQueryError = (
  sqlState: string | null,
  constraint: string | null,
  messageOverride?: string,
): DrizzleQueryError => {
  const message =
    messageOverride ??
    [
      'ERROR: simulated Data API database failure',
      constraint === null ? null : `constraint "${constraint}"`,
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
      vocabularyPronunciations,
      vocabularyMeaningPronunciations,
      contentImportItems,
      auditLogs,
    ]);
    expect(fake.inserts[4]?.values).toMatchObject({
      referenceMap: vocabularyItem.referenceMap,
    });
    expect(
      Object.hasOwn(
        (fake.inserts[4]?.values as ResolvedContentImportItem).referenceMap,
        '__proto__',
      ),
    ).toBe(true);
    expect(fake.inserts[5]?.values).toMatchObject({
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

  it('normalized 어휘와 media 존재를 같은 transaction의 current row에서 다시 확인한다', async () => {
    const readyAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createLookupDatabase([
      [{ id: ids.vocabulary }],
      [
        {
          id: ids.media,
          kind: 'AUDIO',
          storageKey: `audio/${ids.media}`,
          declaredMimeType: 'audio/mpeg',
          declaredSizeBytes: 3,
          declaredSha256: 'a'.repeat(64),
          mimeType: 'audio/mpeg',
          sizeBytes: 3,
          sha256: 'a'.repeat(64),
          status: 'READY',
          readyAt,
          createdAt: readyAt,
        },
      ],
    ]);
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    const result = await repository.runInTransaction(async (transaction) => ({
      duplicateId: await transaction.findVocabularyByNormalizedThai('สวัสดี'),
      media: await transaction.findMediaAssetById(ids.media),
    }));

    expect(result).toEqual({
      duplicateId: ids.vocabulary,
      media: {
        id: ids.media,
        kind: 'AUDIO',
        storageKey: `audio/${ids.media}`,
        declaredMimeType: 'audio/mpeg',
        declaredSizeBytes: 3,
        declaredSha256: 'a'.repeat(64),
        mimeType: 'audio/mpeg',
        sizeBytes: 3,
        sha256: 'a'.repeat(64),
        status: 'READY',
        readyAt,
      },
    });
    expect(fake.selectedTables).toEqual([vocabularies, mediaAssets]);
    expect(fake.lockModes).toEqual(['key share', 'key share']);
  });

  it('저장 직전 사라진 pronunciation media FK를 stable reference 오류로 변환한다', async () => {
    const fake = createFakeDatabase({
      table: vocabularyPronunciations,
      error: {
        code: '23503',
        constraint:
          'vocabulary_pronunciations_media_asset_id_media_assets_id_fk',
      },
    });
    const repository = new DrizzleContentDraftRepository(
      fake.database as never,
    );

    await expect(saveVocabulary(repository)).rejects.toMatchObject({
      code: 'IMPORT_REFERENCE_NOT_FOUND',
      path: 'pronunciations.mediaAssetId',
    });
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
      questionVersions,
      thaiSentences,
      thaiSentenceVersions,
      tokenOccurrences,
      expressionOccurrences,
      questionBlocks,
      questionBlockSentences,
      questionOptions,
      contentImportItems,
      auditLogs,
    ]);
    expect(fake.inserts[8]?.values).toEqual(questionGraph.options);
    expect(
      (fake.inserts[8]?.values as Array<{ isCorrect: boolean }>).filter(
        ({ isCorrect }) => isCorrect,
      ),
    ).toHaveLength(1);
    expect(
      Object.hasOwn(
        (fake.inserts[9]?.values as ResolvedContentImportItem).referenceMap,
        '__proto__',
      ),
    ).toBe(true);
    expect(fake.inserts[10]?.values).toMatchObject({
      action: questionAudit.action,
      targetType: 'QUESTION',
      targetId: ids.question,
      createdAt: questionAudit.occurredAt,
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
          mediaAssetId: ids.media,
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
      mediaAssetId: ids.media,
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
      vocabularyPronunciations,
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
      table: thaiSentenceVersions,
      constraint: 'thai_sentence_versions_media_asset_id_media_assets_id_fk',
      code: 'IMPORT_REFERENCE_NOT_FOUND',
      path: 'sentences.mediaAssetId',
    },
    {
      table: questionVersions,
      constraint:
        'question_versions_type_version_id_question_type_versions_id_fk',
      code: 'IMPORT_QUESTION_TYPE_NOT_FOUND',
      path: 'questionTypeSlug',
    },
    {
      table: tokenOccurrences,
      constraint: 'token_occurrences_vocabulary_fk',
      code: 'IMPORT_REFERENCE_NOT_FOUND',
      path: 'sentences.tokens.vocabulary',
    },
    {
      table: tokenOccurrences,
      constraint: 'token_occurrences_meaning_vocabulary_fk',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.tokens',
    },
    {
      table: tokenOccurrences,
      constraint: 'token_occurrences_pronunciation_vocabulary_fk',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.tokens',
    },
    {
      table: expressionOccurrences,
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
      code: 'IMPORT_DUPLICATE_VOCABULARY',
      path: 'thai',
    },
    {
      table: contentImportItems,
      saveKind: 'VOCABULARY',
      sqlState: '23505',
      constraint: 'content_import_items_import_kind_source_index_unique',
      code: 'CONTENT_DRAFT_ITEM_CONFLICT',
      operation: 'saveVocabularyDraft',
    },
    {
      table: vocabularyPronunciations,
      saveKind: 'VOCABULARY',
      sqlState: '23503',
      constraint: 'vocabulary_pronunciations_media_asset_id_media_assets_id_fk',
      code: 'IMPORT_REFERENCE_NOT_FOUND',
      path: 'pronunciations.mediaAssetId',
    },
    {
      table: tokenOccurrences,
      saveKind: 'QUESTION',
      sqlState: '23503',
      constraint: 'token_occurrences_meaning_vocabulary_fk',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.tokens',
    },
    {
      table: expressionOccurrences,
      saveKind: 'QUESTION',
      sqlState: '23514',
      constraint: 'expression_occurrences_vocabulary_kind_expression',
      code: 'IMPORT_REFERENCE_MISMATCH',
      path: 'sentences.expressions',
    },
  ] as const)(
    '$constraint DatabaseErrorException을 stable 오류로 변환한다',
    async ({ table, saveKind, sqlState, constraint, code, ...expected }) => {
      const fake = createFakeDatabase({
        table,
        error: createDataApiQueryError(sqlState, constraint),
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
      message: undefined,
    },
    {
      sqlState: '22000',
      constraint: 'vocabularies_normalized_thai_unique',
      message: undefined,
    },
    {
      sqlState: null,
      constraint: null,
      message: 'unstructured private database failure',
    },
  ])(
    'unknown Data API message를 SQL·params 없이 generic persistence 오류로 감춘다',
    async ({ sqlState, constraint, message }) => {
      const fake = createFakeDatabase({
        table: vocabularies,
        error: createDataApiQueryError(sqlState, constraint, message),
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
});

const integrationDatabaseUrl =
  process.env.CONTENT_DRAFT_REPOSITORY_TEST_DATABASE_URL;

interface IntegrationFixture {
  importId: string;
  mediaId: string;
  repository: DrizzleContentDraftRepository;
  typeSlug: string;
  typeVersionId: string;
  userId: string;
  wordText: string;
}

const createIntegrationFixture = async (
  pool: Pool,
): Promise<IntegrationFixture> => {
  const userId = randomUUID();
  const importId = randomUUID();
  const mediaId = randomUUID();
  const typeId = randomUUID();
  const typeVersionId = randomUUID();
  const typeSlug = `standard-${randomUUID()}`;
  const wordText = `ก${randomUUID().replaceAll('-', '')}`;
  const sha256 = 'a'.repeat(64);

  await pool.query(
    `insert into users (id, cognito_sub, email, role, status)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
    [userId, `draft-${userId}`, `${userId}@example.com`],
  );
  await pool.query(
    `insert into content_imports (
       id, requested_by, idempotency_key, request_hash,
       vocabulary_count, question_count
     ) values ($1, $2, $3, $4, 1, 1)`,
    [importId, userId, randomUUID(), 'a'.repeat(64)],
  );
  await pool.query(
    `insert into media_assets (
       id, storage_key, declared_mime_type, declared_size_bytes,
       declared_sha256, mime_type, size_bytes, sha256, status, ready_at
     ) values ($1, $2, 'audio/mpeg', 3, $3, 'audio/mpeg', 3, $3, 'READY', now())`,
    [mediaId, `audio/${mediaId}`, sha256],
  );
  await pool.query(
    `insert into question_types (id, slug, display_name, skill)
     values ($1, $2, '통합 유형', 'READING')`,
    [typeId, typeSlug],
  );
  await pool.query(
    `insert into question_type_versions (
       id, question_type_id, version, template, option_count, decision_rules
     ) values ($1, $2, 1, 'STANDARD_CHOICE', 2, '{}')`,
    [typeVersionId, typeId],
  );

  return {
    importId,
    mediaId,
    repository: new DrizzleContentDraftRepository(
      drizzle({ client: pool, schema }),
    ),
    typeSlug,
    typeVersionId,
    userId,
    wordText,
  };
};

const integrationContext = (fixture: IntegrationFixture) => ({
  actorSub: `draft-${fixture.userId}`,
  actorUserId: fixture.userId,
  requestId: `request-${fixture.importId}`,
  occurredAt: new Date('2026-07-24T00:00:00.000Z'),
});

const integrationVocabularyCommand = (
  fixture: IntegrationFixture,
  mediaAssetId = fixture.mediaId,
): CreateVocabularyDraftCommand => ({
  importId: fixture.importId,
  sourceIndex: 0,
  context: integrationContext(fixture),
  input: {
    clientRef: `word-${fixture.importId}`,
    thai: fixture.wordText,
    kind: 'WORD',
    meanings: [
      {
        clientRef: '__proto__',
        meaningKo: '통합 뜻',
        partOfSpeech: '명사',
      },
    ],
    pronunciations: [
      {
        clientRef: 'toString',
        pronunciationKo: '통합 발음',
        toneMarks: '-',
        mediaAssetId,
      },
    ],
  },
});

const integrationSentence = (
  fixture: IntegrationFixture,
): CreateQuestionDraftCommand['input']['options'][number]['sentence'] => ({
  originalText: fixture.wordText,
  translationKo: '통합 문장',
  pronunciationKo: '통합 발음',
  toneMarks: '-',
  mediaAssetId: fixture.mediaId,
  tokens: [
    {
      surface: fixture.wordText,
      startOffset: 0,
      endOffset: Array.from(fixture.wordText).length,
      vocabulary: { clientRef: `word-${fixture.importId}` },
      meaning: { clientRef: '__proto__' },
      pronunciation: { clientRef: 'toString' },
      contextMeaningKo: '통합 뜻',
      role: 'TARGET',
    },
  ],
  expressions: [],
});

const integrationQuestionCommand = (
  fixture: IntegrationFixture,
  typeSlug = fixture.typeSlug,
): CreateQuestionDraftCommand => ({
  importId: fixture.importId,
  sourceIndex: 0,
  context: integrationContext(fixture),
  input: {
    clientRef: `question-${fixture.importId}`,
    questionTypeSlug: typeSlug,
    questionTypeVersion: 1,
    difficulty: 2,
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        sentences: [{ sentence: integrationSentence(fixture) }],
      },
    ],
    options: [
      {
        clientRef: '__proto__',
        position: 0,
        sentence: integrationSentence(fixture),
      },
      {
        clientRef: 'constructor',
        position: 1,
        sentence: integrationSentence(fixture),
      },
    ],
    correctOptionRef: 'constructor',
  },
});

const createCrossOwnershipGraph = (
  fixture: IntegrationFixture,
  input: {
    vocabularyId: string;
    meaningId: string;
    pronunciationId: string;
  },
): ResolvedQuestionDraftGraph => {
  const questionId = randomUUID();
  const questionVersionId = randomUUID();
  const createSentence = (withToken: boolean) => {
    const sentenceId = randomUUID();
    const sentenceVersionId = randomUUID();
    return {
      sentence: { id: sentenceId },
      version: {
        id: sentenceVersionId,
        sentenceId,
        version: 1 as const,
        originalText: fixture.wordText,
        translationKo: '교차 참조',
        pronunciationKo: '교차 참조',
        toneMarks: '-',
        mediaAssetId: fixture.mediaId,
        frozenAt: null,
      },
      tokens: withToken
        ? [
            {
              id: randomUUID(),
              sentenceVersionId,
              position: 0,
              surface: fixture.wordText,
              startOffset: 0,
              endOffset: Array.from(fixture.wordText).length,
              vocabularyId: input.vocabularyId,
              meaningId: input.meaningId,
              pronunciationId: input.pronunciationId,
              contextMeaningKo: '교차 참조',
              role: 'TARGET' as const,
            },
          ]
        : [],
      expressions: [],
    };
  };
  const blockSentence = createSentence(true);
  const firstOptionSentence = createSentence(false);
  const secondOptionSentence = createSentence(false);
  const blockId = randomUUID();

  return {
    question: {
      id: questionId,
      status: 'DRAFT',
      currentPublishedVersionId: null,
    },
    version: {
      id: questionVersionId,
      questionId,
      version: 1,
      typeVersionId: fixture.typeVersionId,
      difficulty: 2,
      status: 'DRAFT',
      validationStatus: 'PENDING',
      validationIssues: [],
      validatedAt: null,
      publishedAt: null,
    },
    sentences: [blockSentence, firstOptionSentence, secondOptionSentence],
    blocks: [
      {
        id: blockId,
        questionVersionId,
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        position: 0,
        sentences: [
          {
            id: randomUUID(),
            blockId,
            sentenceVersionId: blockSentence.version.id,
            position: 0,
            speaker: null,
          },
        ],
      },
    ],
    options: [
      {
        id: randomUUID(),
        questionVersionId,
        sentenceVersionId: firstOptionSentence.version.id,
        position: 0,
        isCorrect: false,
      },
      {
        id: randomUUID(),
        questionVersionId,
        sentenceVersionId: secondOptionSentence.version.id,
        position: 1,
        isCorrect: true,
      },
    ],
  };
};

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleContentDraftRepository PostgreSQL 16 통합',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!integrationDatabaseUrl) {
        throw new Error('CONTENT_DRAFT_REPOSITORY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
      const version = await pool.query<{ serverVersionNum: string }>(
        `select current_setting('server_version_num') "serverVersionNum"`,
      );
      expect(Number(version.rows[0]?.serverVersionNum)).toBeGreaterThanOrEqual(
        160000,
      );
      expect(Number(version.rows[0]?.serverVersionNum)).toBeLessThan(170000);
    });

    afterAll(async () => {
      await pool.end();
    });

    it('어휘 map 재조회 뒤 같은 import 참조 문제를 DRAFT와 정답 하나로 저장한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new ContentDraftService(fixture.repository);

      const vocabulary = await service.createVocabularyItem(
        integrationVocabularyCommand(fixture),
      );
      const storedVocabularyItem = await pool.query<{
        referenceMap: Record<string, string>;
      }>(
        `select reference_map "referenceMap"
           from content_import_items
          where import_id = $1 and kind = 'VOCABULARY'`,
        [fixture.importId],
      );
      expect(storedVocabularyItem.rows[0]?.referenceMap).toEqual(
        vocabulary.referenceMap,
      );
      expect(
        Object.hasOwn(
          storedVocabularyItem.rows[0]?.referenceMap ?? {},
          '__proto__',
        ),
      ).toBe(true);
      const duplicateCommand = integrationVocabularyCommand(fixture);
      duplicateCommand.sourceIndex = 1;
      duplicateCommand.input.clientRef = `duplicate-${fixture.importId}`;
      await expect(
        service.createVocabularyItem(duplicateCommand),
      ).rejects.toMatchObject({
        code: 'IMPORT_DUPLICATE_VOCABULARY',
        path: 'thai',
      });

      const question = await service.createQuestionItem(
        integrationQuestionCommand(fixture),
      );

      const stored = await pool.query<{
        auditCount: string;
        correctCount: string;
        itemCount: string;
        questionStatus: string;
        versionStatus: string;
      }>(
        `select
           (select count(*) from audit_logs
             where summary ->> 'importId' = $1::text) "auditCount",
           (select count(*) from question_options
             where question_version_id = (
               select id from question_versions where question_id = $2
             ) and is_correct) "correctCount",
           (select count(*) from content_import_items
             where import_id = $1::uuid) "itemCount",
           (select status from questions where id = $2) "questionStatus",
           (select status from question_versions
             where question_id = $2) "versionStatus"`,
        [fixture.importId, question.targetId],
      );
      expect(stored.rows[0]).toEqual({
        auditCount: '2',
        correctCount: '1',
        itemCount: '2',
        questionStatus: 'DRAFT',
        versionStatus: 'DRAFT',
      });
      const optionOrder = await pool.query<{
        isCorrect: boolean;
        position: number;
      }>(
        `select position, is_correct "isCorrect"
           from question_options
          where question_version_id = (
            select id from question_versions where question_id = $1
          )
          order by position`,
        [question.targetId],
      );
      expect(optionOrder.rows).toEqual([
        { position: 0, isCorrect: false },
        { position: 1, isCorrect: true },
      ]);
    });

    it('missing media와 type 실패는 stable 오류만 남기고 해당 draft graph를 남기지 않는다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new ContentDraftService(fixture.repository);
      const vocabulariesBefore = await pool.query<{ count: string }>(
        `select count(*) from vocabularies`,
      );

      await expect(
        service.createVocabularyItem(
          integrationVocabularyCommand(fixture, randomUUID()),
        ),
      ).rejects.toMatchObject({
        code: 'IMPORT_REFERENCE_NOT_FOUND',
        path: 'pronunciations.0.mediaAssetId',
      });
      const vocabulariesAfterFailure = await pool.query<{ count: string }>(
        `select count(*) from vocabularies`,
      );
      expect(vocabulariesAfterFailure.rows[0]?.count).toBe(
        vocabulariesBefore.rows[0]?.count,
      );
      const vocabulary = await service.createVocabularyItem(
        integrationVocabularyCommand(fixture),
      );
      const questionsBefore = await pool.query<{ count: string }>(
        `select count(*) from questions`,
      );
      await expect(
        service.createQuestionItem(
          integrationQuestionCommand(fixture, `missing-${randomUUID()}`),
        ),
      ).rejects.toMatchObject({
        code: 'IMPORT_QUESTION_TYPE_NOT_FOUND',
        path: 'questionTypeSlug',
      });
      const missingReferenceCommand = integrationQuestionCommand(fixture);
      missingReferenceCommand.input.blocks[0]!.sentences[0]!.sentence.tokens[0]!.vocabulary =
        { clientRef: `missing-${randomUUID()}` };
      await expect(
        service.createQuestionItem(missingReferenceCommand),
      ).rejects.toMatchObject({
        code: 'IMPORT_REFERENCE_NOT_FOUND',
        path: 'blocks.0.sentences.0.sentence.tokens.0.vocabulary',
      });
      const questionsAfterFailure = await pool.query<{ count: string }>(
        `select count(*) from questions`,
      );
      expect(questionsAfterFailure.rows[0]?.count).toBe(
        questionsBefore.rows[0]?.count,
      );

      const counts = await pool.query<{
        questionItems: string;
        vocabularies: string;
      }>(
        `select
           (select count(*) from content_import_items
             where import_id = $1 and kind = 'QUESTION') "questionItems",
           (select count(*) from vocabularies where id = $2) "vocabularies"`,
        [fixture.importId, vocabulary.targetId],
      );
      expect(counts.rows[0]).toEqual({
        questionItems: '0',
        vocabularies: '1',
      });
    });

    it('동시 같은 question item은 graph와 item을 각각 하나만 commit한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new ContentDraftService(fixture.repository);
      await service.createVocabularyItem(integrationVocabularyCommand(fixture));
      const before = await pool.query<{ count: string }>(
        `select count(*) from questions`,
      );
      const command = integrationQuestionCommand(fixture);

      const settled = await Promise.allSettled([
        service.createQuestionItem(command),
        service.createQuestionItem(command),
      ]);

      expect(
        settled.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(settled.find(({ status }) => status === 'rejected')).toMatchObject(
        {
          status: 'rejected',
          reason: { code: 'CONTENT_DRAFT_ITEM_CONFLICT' },
        },
      );
      const after = await pool.query<{ count: string }>(
        `select count(*) from questions`,
      );
      expect(Number(after.rows[0]?.count) - Number(before.rows[0]?.count)).toBe(
        1,
      );
      const itemCount = await pool.query<{ count: string }>(
        `select count(*) from content_import_items
          where import_id = $1 and kind = 'QUESTION'`,
        [fixture.importId],
      );
      expect(itemCount.rows[0]?.count).toBe('1');
    });

    it('다른 vocabulary의 meaning·pronunciation 교차 참조 FK는 각 question graph를 rollback한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = new ContentDraftService(fixture.repository);
      const vocabulary = await service.createVocabularyItem(
        integrationVocabularyCommand(fixture),
      );
      const otherVocabularyId = randomUUID();
      const otherMeaningId = randomUUID();
      const otherPronunciationId = randomUUID();
      await pool.query(
        `insert into vocabularies (id, thai, normalized_thai, kind, status)
         values ($1, $2, $2, 'WORD', 'DRAFT')`,
        [otherVocabularyId, `ข${randomUUID().replaceAll('-', '')}`],
      );
      await pool.query(
        `insert into vocabulary_meanings (
           id, vocabulary_id, meaning_ko, part_of_speech
         ) values ($1, $2, '다른 뜻', '명사')`,
        [otherMeaningId, otherVocabularyId],
      );
      await pool.query(
        `insert into vocabulary_pronunciations (
           id, vocabulary_id, pronunciation_ko, tone_marks, media_asset_id
         ) values ($1, $2, '다른 발음', '-', $3)`,
        [otherPronunciationId, otherVocabularyId, fixture.mediaId],
      );
      const correctMeaningId = vocabulary.referenceMap['__proto__']!;
      const correctPronunciationId = vocabulary.referenceMap['toString']!;
      const graphs = [
        createCrossOwnershipGraph(fixture, {
          vocabularyId: vocabulary.targetId,
          meaningId: otherMeaningId,
          pronunciationId: correctPronunciationId,
        }),
        createCrossOwnershipGraph(fixture, {
          vocabularyId: vocabulary.targetId,
          meaningId: correctMeaningId,
          pronunciationId: otherPronunciationId,
        }),
      ];

      for (const [sourceIndex, graph] of graphs.entries()) {
        const targetId = graph.question.id;
        await expect(
          fixture.repository.runInTransaction((transaction) =>
            transaction.saveQuestionDraft({
              graph,
              item: {
                id: randomUUID(),
                importId: fixture.importId,
                kind: 'QUESTION',
                sourceIndex,
                clientRef: `cross-${sourceIndex}-${fixture.importId}`,
                status: 'IMPORTED',
                targetId,
                errors: [],
                referenceMap: {
                  [`cross-${sourceIndex}-${fixture.importId}`]: targetId,
                },
              },
              audit: {
                ...integrationContext(fixture),
                action: 'CONTENT_QUESTION_DRAFT_IMPORTED',
                targetType: 'QUESTION',
                targetId,
                summary: { importId: fixture.importId, sourceIndex },
              },
            }),
          ),
        ).rejects.toMatchObject({
          code: 'IMPORT_REFERENCE_MISMATCH',
          path: 'sentences.tokens',
        });
      }
      const counts = await pool.query<{
        itemCount: string;
        questionCount: string;
        sentenceCount: string;
      }>(
        `select
           (select count(*) from content_import_items
             where import_id = $1 and kind = 'QUESTION') "itemCount",
           (select count(*) from questions
             where id = any($2::uuid[])) "questionCount",
           (select count(*) from thai_sentences
             where id = any($3::uuid[])) "sentenceCount"`,
        [
          fixture.importId,
          graphs.map(({ question }) => question.id),
          graphs.flatMap(({ sentences }) =>
            sentences.map(({ sentence }) => sentence.id),
          ),
        ],
      );
      expect(counts.rows[0]).toEqual({
        itemCount: '0',
        questionCount: '0',
        sentenceCount: '0',
      });
    });
  },
);
