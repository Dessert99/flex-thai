/** canonical 콘텐츠 draft의 insert 순서·오류 변환·transaction 경계를 고정한다 */
import { DatabaseErrorException } from '@aws-sdk/client-rds-data';
import type {
  ContentDraftTransaction,
  ResolvedContentDraftAudit,
  ResolvedContentImportItem,
  ResolvedVocabularyDraftGraph,
} from '@flex-thia/domain/content-import/content-draft.repository';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it, vi } from 'vitest';
import { contentImportItems } from '../schema/content-import.schema.js';
import { auditLogs } from '../schema/identity.schema.js';

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
  expression: '00000000-0000-4000-8000-000000000008',
  question: '00000000-0000-4000-8000-000000000009',
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

describe('DrizzleContentDraftRepository Aurora Data API 오류 변환', () => {
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
});
