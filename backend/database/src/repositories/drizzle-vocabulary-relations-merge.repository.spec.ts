/** 어휘 병합의 UUID 잠금·fingerprint 재검증·SERIALIZABLE 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleVocabularyAdminRepository } from './drizzle-vocabulary-admin.repository.js';

const sourceId = '00000000-0000-4000-8000-000000000001';
const representativeId = '00000000-0000-4000-8000-000000000002';

const graphSelectResults = (
  id: string,
  status: 'DRAFT' | 'PUBLISHED',
  incomingMergeSourceIds: string[] = [],
) => [
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
  incomingMergeSourceIds.map((incomingId) => ({ id: incomingId })),
  [],
  [],
  [],
  [],
  [],
];

const createFake = (incomingMergeSourceIds: string[] = []) => {
  const selectResults = [
    [{ id: sourceId }, { id: representativeId }],
    ...graphSelectResults(sourceId, 'DRAFT', incomingMergeSourceIds),
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

  it.each(['40001', '40P01'])(
    'PostgreSQL 경쟁 오류 %s를 stable 병합 conflict로 변환한다',
    async (code) => {
      const repository = new DrizzleVocabularyAdminRepository({
        transaction: vi.fn().mockRejectedValue({ code }),
      } as never);

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
    },
  );

  it('잠금 뒤 source를 가리키는 MERGED row가 있으면 이동 전에 conflict로 중단한다', async () => {
    const fake = createFake(['00000000-0000-4000-8000-000000000099']);
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
    expect(fake.session.execute).not.toHaveBeenCalled();
  });

  it('Data API SQLState 40001도 stable 병합 conflict로 변환한다', async () => {
    const repository = new DrizzleVocabularyAdminRepository({
      transaction: vi.fn().mockRejectedValue({
        name: 'DatabaseErrorException',
        message:
          'ERROR: could not serialize access due to concurrent update; SQLState: 40001',
      }),
    } as never);

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
  });
});

describe('DrizzleVocabularyAdminRepository 관계 응답', () => {
  it('저장소 내부 경로 vocabularyId를 DB relation 결과에 섞지 않는다', async () => {
    const stored = {
      id: sourceId,
      sourceMeaningId: '00000000-0000-4000-8000-000000000003',
      targetMeaningId: '00000000-0000-4000-8000-000000000004',
      type: 'RELATED',
      direction: 'DIRECTED',
      status: 'PENDING',
      createdAt: new Date('2026-07-27T00:00:00.000Z'),
      updatedAt: new Date('2026-07-27T00:00:00.000Z'),
    } as const;
    const returning = vi.fn().mockResolvedValue([stored]);
    const values = vi.fn(() => ({ returning }));
    const repository = new DrizzleVocabularyAdminRepository({
      insert: vi.fn(() => ({ values })),
    } as never);

    await expect(
      repository.createRelation({
        ...stored,
        vocabularyId: representativeId,
      }),
    ).resolves.toEqual(stored);
  });
});
