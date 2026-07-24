/** 문제 게시 adapter의 mapping·상태 조건·transaction 경계를 고정한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  auditLogs,
  questionVersions,
  questions,
  thaiSentenceVersions,
} from '../schema/index.js';
import {
  DrizzleQuestionPublicationRepository,
  QuestionPublicationPersistenceError,
} from './drizzle-question-publication.repository.js';

type QueryResult = Array<Record<string, unknown>>;

interface UpdateCall {
  table: unknown;
  values?: Record<string, unknown>;
  condition?: unknown;
}

const toSql = (condition: unknown) =>
  new PgDialect().sqlToQuery(condition as never);

const createFake = (options?: {
  selectResults?: QueryResult[];
  returningResults?: QueryResult[];
}) => {
  const selectResults = [...(options?.selectResults ?? [])];
  const returningResults = [...(options?.returningResults ?? [])];
  const updateCalls: UpdateCall[] = [];
  const insertValues: Array<Record<string, unknown>> = [];
  const lockModes: unknown[] = [];

  const select = vi.fn(() => {
    const chain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      for: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.for.mockImplementation((mode: unknown) => {
      lockModes.push(mode);
      return chain;
    });
    chain.orderBy.mockImplementation(() =>
      Promise.resolve(selectResults.shift() ?? []),
    );
    chain.limit.mockImplementation(() =>
      Promise.resolve(selectResults.shift() ?? []),
    );
    return chain;
  });
  const update = vi.fn((table: unknown) => {
    const call: UpdateCall = { table };
    updateCalls.push(call);
    return {
      set: vi.fn((values: Record<string, unknown>) => {
        call.values = values;
        return {
          where: vi.fn((condition: unknown) => {
            call.condition = condition;
            return {
              returning: vi.fn(() =>
                Promise.resolve(returningResults.shift() ?? []),
              ),
            };
          }),
        };
      }),
    };
  });
  const insert = vi.fn((table: unknown) => {
    expect(table).toBe(auditLogs);
    return {
      values: vi.fn((values: Record<string, unknown>) => {
        insertValues.push(values);
        return Promise.resolve();
      }),
    };
  });
  const transactionValue = { select, update, insert };
  const database = {
    transaction: vi.fn(
      <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
        work(transactionValue),
    ),
  };

  return { database, insertValues, lockModes, updateCalls };
};

const withTransaction = async <T>(
  database: ReturnType<typeof createFake>['database'],
  work: Parameters<DrizzleQuestionPublicationRepository['runInTransaction']>[0],
) => {
  const repository = new DrizzleQuestionPublicationRepository(
    database as never,
  );
  return repository.runInTransaction(work) as Promise<T>;
};

const createPronunciationMediaCandidateFake = (
  media: Record<string, unknown>,
) =>
  createFake({
    selectResults: [
      [
        {
          id: 'version-id',
          questionId: 'question-id',
          difficulty: 3,
          typeVersionId: 'type-version-id',
          template: 'STANDARD_CHOICE',
          optionCount: 1,
        },
      ],
      [],
      [],
      [
        {
          id: 'option-id',
          sentenceVersionId: 'sentence-id',
          position: 0,
          isCorrect: true,
        },
      ],
      [
        {
          sentenceVersionId: 'sentence-id',
          originalText: 'ก',
          translationKo: '정답',
          pronunciationKo: '꼬',
          toneMarks: '-',
          sentenceMediaAssetId: 'media-id',
          mediaId: 'media-id',
          mediaKind: 'AUDIO',
          mediaStorageKey: 'audio/media-id',
          mediaDeclaredMimeType: 'audio/mpeg',
          mediaDeclaredSizeBytes: 1,
          mediaDeclaredSha256: 'a'.repeat(64),
          mediaMimeType: 'audio/mpeg',
          mediaSizeBytes: 1,
          mediaSha256: 'a'.repeat(64),
          mediaStatus: 'READY',
          mediaReadyAt: new Date('2026-07-24T00:00:00.000Z'),
        },
      ],
      [
        {
          sentenceVersionId: 'sentence-id',
          position: 0,
          surface: 'ก',
          startOffset: 0,
          endOffset: 1,
          vocabularyId: 'word-id',
          meaningId: 'meaning-id',
          pronunciationId: 'pronunciation-id',
          contextMeaningKo: '문맥 뜻',
          role: 'TARGET',
          vocabularyStatus: 'PUBLISHED',
          ...media,
        },
      ],
      [],
    ],
  });

describe('DrizzleQuestionPublicationRepository', () => {
  it('transaction callback 결과와 예외를 변경하지 않는다', async () => {
    const fake = createFake();
    const repository = new DrizzleQuestionPublicationRepository(
      fake.database as never,
    );

    await expect(
      repository.runInTransaction(async () => Promise.resolve('result')),
    ).resolves.toBe('result');
    await expect(
      repository.runInTransaction(() =>
        Promise.reject(new Error('transaction-failed')),
      ),
    ).rejects.toThrow('transaction-failed');
  });

  it('문제와 문제 버전 row를 domain record로 읽는다', async () => {
    const publishedAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createFake({
      selectResults: [
        [
          {
            id: 'question-id',
            status: 'PUBLISHED',
            currentPublishedVersionId: 'published-version-id',
          },
        ],
        [
          {
            id: 'version-id',
            questionId: 'question-id',
            version: 2,
            status: 'PUBLISHED',
            validationStatus: 'PASSED',
            publishedAt,
          },
        ],
      ],
    });

    await withTransaction(fake.database, async (transaction) => {
      await expect(transaction.loadQuestion('question-id')).resolves.toEqual({
        id: 'question-id',
        status: 'PUBLISHED',
        currentPublishedVersionId: 'published-version-id',
      });
      await expect(transaction.loadVersion('version-id')).resolves.toEqual({
        id: 'version-id',
        questionId: 'question-id',
        version: 2,
        status: 'PUBLISHED',
        validationStatus: 'PASSED',
        publishedAt,
      });
    });
    expect(fake.lockModes).toEqual(['update', 'update']);
  });

  it('최신 콘텐츠 row를 위치 순서의 검증 후보로 조립하고 같은 문장을 재사용한다', async () => {
    const readyAt = new Date('2026-07-24T00:00:00.000Z');
    const media = {
      mediaId: 'media-id',
      mediaKind: 'AUDIO',
      mediaStorageKey: 'audio/media-id',
      mediaDeclaredMimeType: 'audio/mpeg',
      mediaDeclaredSizeBytes: 2,
      mediaDeclaredSha256: 'a'.repeat(64),
      mediaMimeType: 'audio/mpeg',
      mediaSizeBytes: 2,
      mediaSha256: 'a'.repeat(64),
      mediaStatus: 'READY',
      mediaReadyAt: readyAt,
    };
    const fake = createFake({
      selectResults: [
        [
          {
            id: 'version-id',
            questionId: 'question-id',
            difficulty: 3,
            typeVersionId: 'type-version-id',
            template: 'STANDARD_CHOICE',
            optionCount: 1,
          },
        ],
        [
          {
            id: 'block-id',
            kind: 'QUESTION',
            displayMode: 'TEXT',
            position: 0,
          },
        ],
        [
          {
            blockId: 'block-id',
            sentenceVersionId: 'sentence-id',
            position: 0,
            speaker: null,
          },
        ],
        [
          {
            id: 'option-id',
            sentenceVersionId: 'sentence-id',
            position: 0,
            isCorrect: true,
          },
        ],
        [
          {
            sentenceVersionId: 'sentence-id',
            originalText: 'กข',
            translationKo: '정답',
            pronunciationKo: '꼬 커',
            toneMarks: '- -',
            sentenceMediaAssetId: 'media-id',
            ...media,
          },
        ],
        [
          {
            sentenceVersionId: 'sentence-id',
            position: 0,
            surface: 'ก',
            startOffset: 0,
            endOffset: 1,
            vocabularyId: 'word-id',
            meaningId: 'meaning-id',
            pronunciationId: 'pronunciation-id',
            contextMeaningKo: '문맥 뜻',
            role: 'TARGET',
            vocabularyStatus: 'PUBLISHED',
            pronunciationMediaAssetId: 'pronunciation-media-id',
            pronunciationMediaId: 'pronunciation-media-id',
            pronunciationMediaKind: 'AUDIO',
            pronunciationMediaStorageKey: 'audio/pronunciation',
            pronunciationMediaDeclaredMimeType: 'audio/mpeg',
            pronunciationMediaDeclaredSizeBytes: 1,
            pronunciationMediaDeclaredSha256: 'b'.repeat(64),
            pronunciationMediaMimeType: 'audio/mpeg',
            pronunciationMediaSizeBytes: 1,
            pronunciationMediaSha256: 'b'.repeat(64),
            pronunciationMediaStatus: 'READY',
            pronunciationMediaReadyAt: readyAt,
          },
        ],
        [
          {
            sentenceVersionId: 'sentence-id',
            startTokenIndex: 0,
            endTokenIndex: 2,
            vocabularyId: 'expression-id',
            vocabularyKind: 'EXPRESSION',
            representative: true,
            vocabularyStatus: 'PUBLISHED',
          },
        ],
      ],
    });

    await withTransaction(fake.database, async (transaction) => {
      const candidate = await transaction.loadValidationCandidate('version-id');

      expect(candidate).toMatchObject({
        id: 'version-id',
        questionId: 'question-id',
        difficulty: 3,
        typeVersion: {
          id: 'type-version-id',
          template: 'STANDARD_CHOICE',
          optionCount: 1,
        },
        blocks: [
          {
            id: 'block-id',
            kind: 'QUESTION',
            displayMode: 'TEXT',
            position: 0,
          },
        ],
        options: [{ id: 'option-id', position: 0, isCorrect: true }],
      });
      expect(candidate?.blocks[0]?.sentences[0]?.sentence).toBe(
        candidate?.options[0]?.sentence,
      );
      expect(candidate?.options[0]?.sentence.input).toEqual({
        originalText: 'กข',
        translationKo: '정답',
        pronunciationKo: '꼬 커',
        toneMarks: '- -',
        mediaAssetId: 'media-id',
        tokens: [
          {
            position: 0,
            surface: 'ก',
            startOffset: 0,
            endOffset: 1,
            vocabularyId: 'word-id',
            meaningId: 'meaning-id',
            pronunciationId: 'pronunciation-id',
            contextMeaningKo: '문맥 뜻',
            role: 'TARGET',
          },
        ],
        expressions: [
          {
            startTokenIndex: 0,
            endTokenIndex: 2,
            vocabularyId: 'expression-id',
            vocabularyKind: 'EXPRESSION',
            adminSelected: true,
          },
        ],
      });
      expect(candidate?.options[0]?.sentence.referencedVocabularies).toEqual([
        { id: 'word-id', status: 'PUBLISHED' },
        { id: 'expression-id', status: 'PUBLISHED' },
      ]);
      expect(
        candidate?.options[0]?.sentence.pronunciationMediaAssets,
      ).toHaveLength(1);
    });
  });

  it('선택된 발음의 media 참조가 null이면 candidate에 누락 상태를 보존한다', async () => {
    const fake = createPronunciationMediaCandidateFake({
      pronunciationMediaAssetId: null,
      pronunciationMediaId: null,
      pronunciationMediaKind: null,
      pronunciationMediaStorageKey: null,
      pronunciationMediaDeclaredMimeType: null,
      pronunciationMediaDeclaredSizeBytes: null,
      pronunciationMediaDeclaredSha256: null,
      pronunciationMediaMimeType: null,
      pronunciationMediaSizeBytes: null,
      pronunciationMediaSha256: null,
      pronunciationMediaStatus: null,
      pronunciationMediaReadyAt: null,
    });

    await withTransaction(fake.database, async (transaction) => {
      const candidate = await transaction.loadValidationCandidate('version-id');

      expect(candidate?.options[0]?.sentence.pronunciationMediaAssets).toEqual([
        null,
      ]);
    });
  });

  it('선택된 발음 media의 non-null READY runtime metadata가 누락되면 invariant 오류를 던진다', async () => {
    const fake = createPronunciationMediaCandidateFake({
      pronunciationMediaAssetId: 'pronunciation-media-id',
      pronunciationMediaId: 'pronunciation-media-id',
      pronunciationMediaKind: 'AUDIO',
      pronunciationMediaStorageKey: 'audio/pronunciation',
      pronunciationMediaDeclaredMimeType: 'audio/mpeg',
      pronunciationMediaDeclaredSizeBytes: 1,
      pronunciationMediaDeclaredSha256: 'b'.repeat(64),
      pronunciationMediaMimeType: null,
      pronunciationMediaSizeBytes: null,
      pronunciationMediaSha256: null,
      pronunciationMediaStatus: 'READY',
      pronunciationMediaReadyAt: null,
    });

    await expect(
      withTransaction(fake.database, (transaction) =>
        transaction.loadValidationCandidate('version-id'),
      ),
    ).rejects.toMatchObject({
      code: 'MEDIA_ASSET_NOT_READY',
    });
  });

  it('역순으로 받은 block·문장·선택지·token·expression을 position 순서로 복원한다', async () => {
    const readyAt = new Date('2026-07-24T00:00:00.000Z');
    const pronunciationMedia = {
      pronunciationMediaAssetId: 'pronunciation-media-id',
      pronunciationMediaId: 'pronunciation-media-id',
      pronunciationMediaKind: 'AUDIO',
      pronunciationMediaStorageKey: 'audio/pronunciation',
      pronunciationMediaDeclaredMimeType: 'audio/mpeg',
      pronunciationMediaDeclaredSizeBytes: 1,
      pronunciationMediaDeclaredSha256: 'b'.repeat(64),
      pronunciationMediaMimeType: 'audio/mpeg',
      pronunciationMediaSizeBytes: 1,
      pronunciationMediaSha256: 'b'.repeat(64),
      pronunciationMediaStatus: 'READY',
      pronunciationMediaReadyAt: readyAt,
    } as const;
    const token = {
      sentenceVersionId: 'sentence-id',
      vocabularyId: 'word-id',
      meaningId: 'meaning-id',
      pronunciationId: 'pronunciation-id',
      contextMeaningKo: '문맥 뜻',
      role: 'TARGET',
      vocabularyStatus: 'PUBLISHED',
      ...pronunciationMedia,
    } as const;
    const fake = createFake({
      selectResults: [
        [
          {
            id: 'version-id',
            questionId: 'question-id',
            difficulty: 3,
            typeVersionId: 'type-version-id',
            template: 'STANDARD_CHOICE',
            optionCount: 2,
          },
        ],
        [
          {
            id: 'block-1',
            kind: 'QUESTION',
            displayMode: 'TEXT',
            position: 1,
          },
          {
            id: 'block-0',
            kind: 'INSTRUCTION',
            displayMode: 'TEXT',
            position: 0,
          },
        ],
        [
          {
            blockId: 'block-0',
            sentenceVersionId: 'sentence-id',
            position: 1,
            speaker: '두 번째',
          },
          {
            blockId: 'block-0',
            sentenceVersionId: 'sentence-id',
            position: 0,
            speaker: '첫 번째',
          },
        ],
        [
          {
            id: 'option-1',
            sentenceVersionId: 'sentence-id',
            position: 1,
            isCorrect: false,
          },
          {
            id: 'option-0',
            sentenceVersionId: 'sentence-id',
            position: 0,
            isCorrect: true,
          },
        ],
        [
          {
            sentenceVersionId: 'sentence-id',
            originalText: 'กข',
            translationKo: '정답',
            pronunciationKo: '꼬 커',
            toneMarks: '- -',
            sentenceMediaAssetId: 'media-id',
            mediaId: 'media-id',
            mediaKind: 'AUDIO',
            mediaStorageKey: 'audio/media-id',
            mediaDeclaredMimeType: 'audio/mpeg',
            mediaDeclaredSizeBytes: 2,
            mediaDeclaredSha256: 'a'.repeat(64),
            mediaMimeType: 'audio/mpeg',
            mediaSizeBytes: 2,
            mediaSha256: 'a'.repeat(64),
            mediaStatus: 'READY',
            mediaReadyAt: readyAt,
          },
        ],
        [
          {
            ...token,
            position: 1,
            surface: 'ข',
            startOffset: 1,
            endOffset: 2,
          },
          {
            ...token,
            position: 0,
            surface: 'ก',
            startOffset: 0,
            endOffset: 1,
          },
        ],
        [
          {
            sentenceVersionId: 'sentence-id',
            startTokenIndex: 1,
            endTokenIndex: 3,
            vocabularyId: 'expression-1',
            vocabularyKind: 'EXPRESSION',
            representative: false,
            vocabularyStatus: 'PUBLISHED',
          },
          {
            sentenceVersionId: 'sentence-id',
            startTokenIndex: 0,
            endTokenIndex: 2,
            vocabularyId: 'expression-0',
            vocabularyKind: 'EXPRESSION',
            representative: true,
            vocabularyStatus: 'PUBLISHED',
          },
        ],
      ],
    });

    await withTransaction(fake.database, async (transaction) => {
      const candidate = await transaction.loadValidationCandidate('version-id');

      expect(candidate?.blocks.map((block) => block.id)).toEqual([
        'block-0',
        'block-1',
      ]);
      expect(
        candidate?.blocks[0]?.sentences.map((sentence) => sentence.speaker),
      ).toEqual(['첫 번째', '두 번째']);
      expect(candidate?.options.map((option) => option.id)).toEqual([
        'option-0',
        'option-1',
      ]);
      expect(
        candidate?.options[0]?.sentence.input.tokens.map(
          (occurrence) => occurrence.position,
        ),
      ).toEqual([0, 1]);
      expect(
        candidate?.options[0]?.sentence.input.expressions.map(
          (occurrence) => occurrence.startTokenIndex,
        ),
      ).toEqual([0, 1]);
    });
  });

  it('READY media metadata가 불완전하면 안정적인 domain 오류를 던진다', async () => {
    const fake = createFake({
      selectResults: [
        [
          {
            id: 'version-id',
            questionId: 'question-id',
            difficulty: 3,
            typeVersionId: 'type-version-id',
            template: 'STANDARD_CHOICE',
            optionCount: 1,
          },
        ],
        [],
        [],
        [
          {
            id: 'option-id',
            sentenceVersionId: 'sentence-id',
            position: 0,
            isCorrect: true,
          },
        ],
        [
          {
            sentenceVersionId: 'sentence-id',
            originalText: 'ก',
            translationKo: '정답',
            pronunciationKo: '꼬',
            toneMarks: '-',
            sentenceMediaAssetId: 'media-id',
            mediaId: 'media-id',
            mediaKind: 'AUDIO',
            mediaStorageKey: 'audio/media-id',
            mediaDeclaredMimeType: 'audio/mpeg',
            mediaDeclaredSizeBytes: 1,
            mediaDeclaredSha256: 'a'.repeat(64),
            mediaMimeType: null,
            mediaSizeBytes: null,
            mediaSha256: null,
            mediaStatus: 'READY',
            mediaReadyAt: null,
          },
        ],
        [],
        [],
      ],
    });

    await expect(
      withTransaction(fake.database, (transaction) =>
        transaction.loadValidationCandidate('version-id'),
      ),
    ).rejects.toMatchObject({
      code: 'MEDIA_ASSET_NOT_READY',
    });
  });

  it('검증 상태와 이슈와 시각을 한 update에 저장한다', async () => {
    const validatedAt = new Date('2026-07-24T00:00:00.000Z');
    const issues = [{ path: 'options', code: 'OPTION_COUNT_INVALID' }] as const;
    const fake = createFake({ returningResults: [[{ id: 'version-id' }]] });

    await withTransaction(fake.database, (transaction) =>
      transaction.saveValidation(
        'version-id',
        { status: 'FAILED', issues: [...issues] },
        validatedAt,
      ),
    );

    expect(fake.updateCalls).toHaveLength(1);
    expect(fake.updateCalls[0]).toMatchObject({
      table: questionVersions,
      values: {
        validationStatus: 'FAILED',
        validationIssues: issues,
        validatedAt,
      },
    });
    expect(toSql(fake.updateCalls[0]?.condition).params).toEqual([
      'version-id',
    ]);
  });

  it.each([
    [
      'retireVersion',
      ['version-id', 'question-id'],
      questionVersions,
      ['version-id', 'question-id', 'PUBLISHED'],
    ],
    [
      'publishVersion',
      ['version-id', new Date('2026-07-24T00:00:00.000Z')],
      questionVersions,
      ['version-id', 'DRAFT', 'PASSED'],
    ],
    [
      'invalidateVersion',
      ['version-id'],
      questionVersions,
      ['version-id', 'PUBLISHED'],
    ],
    [
      'setCurrentPublishedVersion',
      ['question-id', 'version-id'],
      questions,
      ['question-id', 'DRAFT', 'PUBLISHED'],
    ],
    ['hideQuestion', ['question-id'], questions, ['question-id', 'PUBLISHED']],
    ['restoreQuestion', ['question-id'], questions, ['question-id', 'HIDDEN']],
  ] as const)(
    '%s는 기대 현재 상태가 아니면 안정적인 저장 오류를 던진다',
    async (method, args, table, expectedParams) => {
      const fake = createFake({ returningResults: [[]] });

      await expect(
        withTransaction(fake.database, (transaction) =>
          (transaction[method] as (...input: typeof args) => Promise<void>)(
            ...args,
          ),
        ),
      ).rejects.toBeInstanceOf(QuestionPublicationPersistenceError);

      expect(fake.updateCalls[0]?.table).toBe(table);
      expect(toSql(fake.updateCalls[0]?.condition).params).toEqual(
        expect.arrayContaining([...expectedParams]),
      );
    },
  );

  it('블록과 선택지의 중복을 제거하고 아직 동결되지 않은 문장만 동결한다', async () => {
    const frozenAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createFake({
      selectResults: [
        [
          { sentenceVersionId: 'sentence-1' },
          { sentenceVersionId: 'sentence-2' },
        ],
        [
          { sentenceVersionId: 'sentence-1' },
          { sentenceVersionId: 'sentence-3' },
        ],
      ],
      returningResults: [
        [{ id: 'sentence-1' }, { id: 'sentence-2' }, { id: 'sentence-3' }],
      ],
    });

    await withTransaction(fake.database, (transaction) =>
      transaction.freezeReferencedSentences('version-id', frozenAt),
    );

    expect(fake.updateCalls[0]).toMatchObject({
      table: thaiSentenceVersions,
      values: { frozenAt },
    });
    const query = toSql(fake.updateCalls[0]?.condition);
    expect(query.params).toEqual(
      expect.arrayContaining(['sentence-1', 'sentence-2', 'sentence-3']),
    );
    expect(query.sql).toContain('"frozen_at" is null');
  });

  it('구조화 감사 컬럼과 이전 호환 컬럼을 같은 insert에 저장한다', async () => {
    const fake = createFake();

    await withTransaction(fake.database, (transaction) =>
      transaction.appendAuditLog({
        actorSub: 'cognito-sub',
        actorUserId: 'actor-id',
        action: 'QUESTION_VERSION_PUBLISHED',
        targetType: 'QUESTION_VERSION',
        targetId: 'version-id',
        summary: { questionId: 'question-id' },
        requestId: 'request-id',
        occurredAt: new Date('2026-07-24T00:00:00.000Z'),
      }),
    );

    expect(fake.insertValues).toEqual([
      {
        actorSub: 'cognito-sub',
        actorUserId: 'actor-id',
        action: 'QUESTION_VERSION_PUBLISHED',
        target: 'version-id',
        targetType: 'QUESTION_VERSION',
        targetId: 'version-id',
        summary: { questionId: 'question-id' },
        requestId: 'request-id',
        createdAt: new Date('2026-07-24T00:00:00.000Z'),
      },
    ]);
  });
});
