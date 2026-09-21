/** 콘텐츠 가져오기 claim·REJECTED 저장·최초 완료 audit transaction을 고정한다 */
import type {
  CompleteContentImportInput,
  ContentImportRecord,
  SaveRejectedContentImportItemInput,
} from '@flex-thia/domain/content-import/content-import.repository';

import { describe, expect, it, vi } from 'vitest';

import { auditLogs } from '../schema/identity.schema.js';
import {
  contentImportItems,
  contentImports,
} from '../schema/content-import.schema.js';

import {
  ContentImportPersistenceError,
  DrizzleContentImportRepository,
} from './drizzle-content-import.repository.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  import: '00000000-0000-4000-8000-000000000002',
} as const;

const occurredAt = new Date('2026-07-24T00:00:00.000Z');

const record = (
  overrides: Partial<ContentImportRecord> = {},
): ContentImportRecord => ({
  id: ids.import,
  requestedBy: ids.actor,
  idempotencyKey: '00000000-0000-4000-8000-000000000099',
  requestHash: 'a'.repeat(64),
  status: null,
  vocabularyCount: 1,
  importedCount: 0,
  rejectedCount: 0,
  createdAt: occurredAt,
  completedAt: null,
  ...overrides,
});

const createClaimDatabase = (stored = record()) => {
  const insertedValues: unknown[] = [];
  const conflictTargets: unknown[] = [];
  const transactionValue = {
    insert: vi.fn((table: unknown) => {
      expect(table).toBe(contentImports);
      const chain = {
        values: vi.fn((values: unknown) => {
          insertedValues.push(values);
          return chain;
        }),
        onConflictDoNothing: vi.fn((options: unknown) => {
          conflictTargets.push(options);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue([{ id: ids.import }]),
      };
      return chain;
    }),
    select: vi.fn(() => {
      const chain = {
        from: vi.fn((table: unknown) => {
          expect(table).toBe(contentImports);
          return chain;
        }),
        where: vi.fn(() => chain),
        limit: vi.fn().mockResolvedValue([stored]),
      };
      return chain;
    }),
  };
  return {
    database: {
      transaction: vi.fn(
        <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
          work(transactionValue),
      ),
    },
    insertedValues,
    conflictTargets,
  };
};

const createRejectedDatabase = () => {
  const calls: Array<{ table: unknown; values?: unknown }> = [];
  const transactionValue = {
    insert: vi.fn((table: unknown) => {
      const call = { table, values: undefined as unknown };
      calls.push(call);
      const chain = {
        values: vi.fn((values: unknown) => {
          call.values = values;
          return chain;
        }),
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
      };
      return chain;
    }),
    select: vi.fn(() => {
      const chain = {
        from: vi.fn((table: unknown) => {
          expect(table).toBe(contentImportItems);
          return chain;
        }),
        where: vi.fn(() => chain),
        limit: vi.fn().mockResolvedValue([
          {
            kind: 'VOCABULARY',
            sourceIndex: 0,
            clientRef: 'vocabulary-ref',
            status: 'IMPORTED',
            targetId: '00000000-0000-4000-8000-000000000003',
            errors: [],
          },
        ]),
      };
      return chain;
    }),
  };
  return {
    calls,
    database: {
      transaction: vi.fn(
        <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
          work(transactionValue),
      ),
    },
  };
};

const completeInput: CompleteContentImportInput = {
  importId: ids.import,
  completedAt: occurredAt,
  context: {
    actorSub: 'cognito-sub',
    actorUserId: ids.actor,
    requestId: 'request-id',
    occurredAt,
  },
};

const createCompletionDatabase = (options?: {
  current?: ContentImportRecord;
  itemStatuses?: Array<'IMPORTED' | 'REJECTED'>;
  updated?: boolean;
}) => {
  const selectResults = [
    [options?.current ?? record({ vocabularyCount: 2 })],
    (options?.itemStatuses ?? ['IMPORTED', 'REJECTED']).map((status) => ({
      status,
    })),
  ];
  const inserted: Array<{ table: unknown; values: unknown }> = [];
  const updates: unknown[] = [];
  const transactionValue = {
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        for: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve(selectResults.shift() ?? [])),
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (error: unknown) => unknown,
        ) => Promise.resolve(selectResults.shift() ?? []).then(resolve, reject),
      };
      return chain;
    }),
    update: vi.fn((table: unknown) => {
      expect(table).toBe(contentImports);
      const chain = {
        set: vi.fn((values: unknown) => {
          updates.push(values);
          return chain;
        }),
        where: vi.fn(() => chain),
        returning: vi
          .fn()
          .mockResolvedValue(
            options?.updated === false ? [] : [{ id: ids.import }],
          ),
      };
      return chain;
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        inserted.push({ table, values });
        return Promise.resolve();
      }),
    })),
  };
  return {
    database: {
      transaction: vi.fn(
        <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
          work(transactionValue),
      ),
    },
    inserted,
    updates,
    transactionValue,
  };
};

describe('DrizzleContentImportRepository가 콘텐츠 import 요청의 claim을 처리한다', () => {
  it('원본 body 없이 user·UUID key unique row를 생성하거나 기존 row를 반환한다', async () => {
    const fake = createClaimDatabase();
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );

    const result = await repository.claim({
      id: ids.import,
      requestedBy: ids.actor,
      idempotencyKey: record().idempotencyKey,
      requestHash: record().requestHash,
      vocabularyCount: 1,
      createdAt: occurredAt,
    });

    expect(result).toEqual(record());
    expect(fake.insertedValues[0]).not.toHaveProperty('request');
    expect(fake.insertedValues[0]).not.toHaveProperty('payload');
    expect(fake.conflictTargets).toEqual([
      {
        target: [contentImports.requestedBy, contentImports.idempotencyKey],
      },
    ]);
  });
});

describe('DrizzleContentImportRepository 항목 처리', () => {
  it('REJECTED insert 충돌 시 existing IMPORTED item을 재조회해 그대로 replay한다', async () => {
    const fake = createRejectedDatabase();
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );
    const input: SaveRejectedContentImportItemInput = {
      importId: ids.import,
      kind: 'VOCABULARY',
      sourceIndex: 0,
      clientRef: 'vocabulary-ref',
      errors: [{ path: 'thai', code: 'IMPORT_CONTENT_INVALID' }],
    };

    await expect(repository.saveRejectedItem(input)).resolves.toMatchObject({
      status: 'IMPORTED',
      targetId: '00000000-0000-4000-8000-000000000003',
    });
    expect(fake.calls).toEqual([
      {
        table: contentImportItems,
        values: {
          importId: ids.import,
          kind: 'VOCABULARY',
          sourceIndex: 0,
          clientRef: 'vocabulary-ref',
          status: 'REJECTED',
          targetId: null,
          errors: input.errors,
          referenceMap: {},
        },
      },
    ]);
  });
});

describe('DrizzleContentImportRepository 완료', () => {
  it('unique item row를 집계해 conditional final status와 audit을 같은 transaction에 저장한다', async () => {
    const fake = createCompletionDatabase();
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );

    await repository.complete(completeInput);

    expect(fake.updates).toEqual([
      {
        status: 'COMPLETED_WITH_FAILURES',
        importedCount: 1,
        rejectedCount: 1,
        completedAt: occurredAt,
      },
    ]);
    expect(fake.inserted).toEqual([
      {
        table: auditLogs,
        values: {
          actorSub: 'cognito-sub',
          actorUserId: ids.actor,
          action: 'CONTENT_IMPORT_COMPLETED',
          target: ids.import,
          targetType: 'CONTENT_IMPORT',
          targetId: ids.import,
          summary: {
            importedCount: 1,
            rejectedCount: 1,
            status: 'COMPLETED_WITH_FAILURES',
          },
          requestId: 'request-id',
          createdAt: occurredAt,
        },
      },
    ]);
  });

  it('이미 완료된 concurrent caller는 중복 update와 audit 없이 종료한다', async () => {
    const fake = createCompletionDatabase({
      current: record({
        status: 'COMPLETED',
        importedCount: 2,
        completedAt: occurredAt,
      }),
    });
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );

    await repository.complete(completeInput);

    expect(fake.transactionValue.update).not.toHaveBeenCalled();
    expect(fake.transactionValue.insert).not.toHaveBeenCalled();
  });

  it('item 집계가 total과 다르면 완료로 위장하지 않는다', async () => {
    const fake = createCompletionDatabase({ itemStatuses: ['IMPORTED'] });
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );

    await expect(repository.complete(completeInput)).rejects.toEqual(
      new ContentImportPersistenceError('completeItemCount'),
    );
    expect(fake.transactionValue.update).not.toHaveBeenCalled();
    expect(fake.transactionValue.insert).not.toHaveBeenCalled();
  });
});
