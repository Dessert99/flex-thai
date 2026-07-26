/** 어휘 병합의 UUID 잠금·fingerprint 재검증·SERIALIZABLE 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleVocabularyAdminRepository } from './drizzle-vocabulary-admin.repository.js';

const sourceId = '00000000-0000-4000-8000-000000000001';
const representativeId = '00000000-0000-4000-8000-000000000002';

const graphSelectResults = (id: string, status: 'DRAFT' | 'PUBLISHED') => [
  [
    {
      id,
      thai: id === sourceId ? 'สวัสดี' : 'สวัสดิ์',
      normalizedThai: id === sourceId ? 'สวัสดี' : 'สวัสดิ์',
      kind: 'WORD',
      status,
      mergedIntoVocabularyId: null,
      updatedAt: new Date('2026-07-27T00:00:00.000Z'),
    },
  ],
  [{ id: `${id}-meaning` }],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
];

const createFake = () => {
  const selectResults = [
    [{ id: sourceId }, { id: representativeId }],
    ...graphSelectResults(sourceId, 'DRAFT'),
    ...graphSelectResults(representativeId, 'PUBLISHED'),
  ];
  const select = vi.fn(() => {
    const take = () => Promise.resolve(selectResults.shift() ?? []);
    const chain = {
      from: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      for: vi.fn(() => chain),
      limit: vi.fn(take),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject?: (error: unknown) => unknown,
      ) => take().then(resolve, reject),
    };
    return chain;
  });
  const session = {
    delete: vi.fn(),
    execute: vi.fn(),
    insert: vi.fn(),
    select,
    update: vi.fn(),
  };
  const database = {
    transaction: vi.fn(
      (
        work: (transaction: typeof session) => Promise<unknown>,
        options: unknown,
      ) => work(session).then((result) => ({ options, result })),
    ),
  };
  return { database, session };
};

describe('DrizzleVocabularyAdminRepository 병합', () => {
  it('UUID 순 잠금 뒤 현재 fingerprint가 다르면 어떤 이동 SQL도 실행하지 않는다', async () => {
    const fake = createFake();
    const repository = new DrizzleVocabularyAdminRepository(
      fake.database as never,
    );

    await expect(
      repository.executeMerge({
        sourceVocabularyId: sourceId,
        representativeVocabularyId: representativeId,
        expectedFingerprint: 'stale-token',
        actorSub: 'admin-sub',
        actorUserId: sourceId,
        requestId: 'request-id',
        occurredAt: new Date('2026-07-27T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'VOCABULARY_MERGE_CONFLICT' });
    expect(fake.database.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'serializable' },
    );
    expect(fake.session.execute).not.toHaveBeenCalled();
  });
});
