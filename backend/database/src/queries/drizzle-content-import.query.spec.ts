/** 전체 관리자 import 이력의 stable page와 private-field 비노출을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { contentImportItems, contentImports } from '../schema/index.js';
import { DrizzleContentImportQuery } from './drizzle-content-import.query.js';

const ids = {
  import: '00000000-0000-4000-8000-000000000001',
  target: '00000000-0000-4000-8000-000000000002',
} as const;

const completedAt = new Date('2026-07-24T00:10:00.000Z');
const createdAt = new Date('2026-07-24T00:00:00.000Z');

const summaryRow = {
  id: ids.import,
  status: 'COMPLETED_WITH_FAILURES',
  vocabularyCount: 1,
  questionCount: 1,
  importedCount: 1,
  rejectedCount: 1,
  createdAt,
  completedAt,
};

const createSelectDatabase = (
  results: Array<Array<Record<string, unknown>>>,
) => {
  const queue = [...results];
  const calls: Array<{
    fields: Record<string, unknown>;
    table?: unknown;
    orderBy?: unknown[];
    limit?: number;
    offset?: number;
  }> = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call = { fields } as (typeof calls)[number];
    calls.push(call);
    const consume = () => queue.shift() ?? [];
    const chain = {
      from: vi.fn((table: unknown) => {
        call.table = table;
        return chain;
      }),
      where: vi.fn(() => chain),
      orderBy: vi.fn((...order: unknown[]) => {
        call.orderBy = order;
        return chain;
      }),
      limit: vi.fn((limit: number) => {
        call.limit = limit;
        return chain;
      }),
      offset: vi.fn((offset: number) => {
        call.offset = offset;
        return Promise.resolve(consume());
      }),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject: (error: unknown) => unknown,
      ) => Promise.resolve(consume()).then(resolve, reject),
    };
    return chain;
  });
  return { calls, database: { select } };
};

describe('DrizzleContentImportQuery 목록', () => {
  it('requester 범위 없이 완료 이력을 stable page로 반환하고 private field를 select하지 않는다', async () => {
    const fake = createSelectDatabase([[{ totalItems: 1 }], [summaryRow]]);
    const query = new DrizzleContentImportQuery(fake.database as never);

    await expect(query.list({ page: 2, pageSize: 10 })).resolves.toEqual({
      items: [summaryRow],
      page: {
        page: 2,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      },
    });
    expect(fake.calls.map(({ table }) => table)).toEqual([
      contentImports,
      contentImports,
    ]);
    expect(fake.calls[1]).toMatchObject({ limit: 10, offset: 10 });
    expect(Object.keys(fake.calls[1]!.fields)).not.toEqual(
      expect.arrayContaining([
        'requestedBy',
        'idempotencyKey',
        'requestHash',
        'request',
        'payload',
      ]),
    );
  });
});

describe('DrizzleContentImportQuery 상세', () => {
  it('vocabulary source 순서 뒤 question source 순서로 공개 item만 반환한다', async () => {
    const fake = createSelectDatabase([
      [summaryRow],
      [
        {
          kind: 'VOCABULARY',
          sourceIndex: 0,
          status: 'IMPORTED',
          targetId: ids.target,
          errors: [],
        },
        {
          kind: 'QUESTION',
          sourceIndex: 0,
          status: 'REJECTED',
          targetId: null,
          errors: [
            {
              path: 'tokens.0.vocabulary',
              code: 'IMPORT_REFERENCE_NOT_FOUND',
            },
          ],
        },
      ],
    ]);
    const query = new DrizzleContentImportQuery(fake.database as never);

    const result = await query.findById(ids.import);

    expect(result).toEqual({
      ...summaryRow,
      items: [
        {
          kind: 'VOCABULARY',
          sourceIndex: 0,
          status: 'IMPORTED',
          targetId: ids.target,
          errors: [],
        },
        {
          kind: 'QUESTION',
          sourceIndex: 0,
          status: 'REJECTED',
          targetId: null,
          errors: [
            {
              path: 'tokens.0.vocabulary',
              code: 'IMPORT_REFERENCE_NOT_FOUND',
            },
          ],
        },
      ],
    });
    expect(fake.calls.map(({ table }) => table)).toEqual([
      contentImports,
      contentImportItems,
    ]);
    expect(Object.keys(fake.calls[0]!.fields)).not.toEqual(
      expect.arrayContaining(['requestedBy', 'idempotencyKey', 'requestHash']),
    );
    expect(Object.keys(fake.calls[1]!.fields)).not.toEqual(
      expect.arrayContaining([
        'id',
        'importId',
        'clientRef',
        'referenceMap',
        'createdAt',
      ]),
    );
  });

  it('없는 import와 미완료 import는 공개 상세에서 null이다', async () => {
    const missing = createSelectDatabase([[]]);
    const incomplete = createSelectDatabase([
      [{ ...summaryRow, status: null, completedAt: null }],
    ]);

    await expect(
      new DrizzleContentImportQuery(missing.database as never).findById(
        ids.import,
      ),
    ).resolves.toBeNull();
    await expect(
      new DrizzleContentImportQuery(incomplete.database as never).findById(
        ids.import,
      ),
    ).resolves.toBeNull();
  });
});
