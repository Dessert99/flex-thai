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

describe('DrizzleQuestionPublicationRepository가 문제 게시 생명주기를 영속화한다', () => {
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
          },
        ],
        [
          {
            sentenceVersionId: 'sentence-id',
            startTokenIndex: 0,
            endTokenIndex: 2,
            vocabularyId: 'expression-id',
            vocabularyKind: 'EXPRESSION',
            meaningId: 'expression-meaning-id',
            pronunciationId: 'expression-pronunciation-id',
            contextMeaningKo: '표현 뜻',
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
            position: 0,
          },
        ],
        options: [{ id: 'option-id', position: 0, isCorrect: true }],
      });
      expect(candidate?.blocks[0]?.sentences[0]?.sentence).toBe(
        candidate?.options[0]?.sentence,
      );
      expect(candidate?.options[0]?.sentence?.input).toEqual({
        originalText: 'กข',
        translationKo: '정답',
        pronunciationKo: '꼬 커',
        toneMarks: '- -',
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
            meaningId: 'expression-meaning-id',
            pronunciationId: 'expression-pronunciation-id',
            contextMeaningKo: '표현 뜻',
            adminSelected: true,
          },
        ],
      });
      expect(candidate?.options[0]?.sentence?.referencedVocabularies).toEqual([
        { id: 'word-id', status: 'PUBLISHED' },
        { id: 'expression-id', status: 'PUBLISHED' },
      ]);
    });
  });

  it('DRAFT 검증 상태와 이슈와 시각을 한 update에 저장한다', async () => {
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
    expect(toSql(fake.updateCalls[0]?.condition).params).toEqual(
      expect.arrayContaining(['version-id', 'DRAFT']),
    );
  });

  it('DRAFT가 아닌 버전의 검증 저장 결과가 없으면 안정적인 저장 오류를 던진다', async () => {
    const validatedAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createFake({ returningResults: [[]] });

    await expect(
      withTransaction(fake.database, (transaction) =>
        transaction.saveValidation(
          'version-id',
          { status: 'PASSED', issues: [] },
          validatedAt,
        ),
      ),
    ).rejects.toEqual(
      new QuestionPublicationPersistenceError('saveValidation'),
    );
    expect(toSql(fake.updateCalls[0]?.condition).params).toEqual(
      expect.arrayContaining(['version-id', 'DRAFT']),
    );
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
