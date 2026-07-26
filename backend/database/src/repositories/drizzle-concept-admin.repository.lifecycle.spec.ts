/** 개념 repository 수명주기의 transaction 경계를 검증한다 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleConceptAdminRepository } from './drizzle-concept-admin.repository.js';

const context = {
  actorSub: 'admin-sub',
  actorUserId: '11111111-1111-4111-8111-111111111111',
  requestId: 'request-1',
  occurredAt: new Date('2026-07-26T00:00:00.000Z'),
};

const candidateVersion = {
  id: 'version-1',
  conceptId: 'concept-1',
  revision: 2,
  status: 'DRAFT',
  validationStatus: 'PASSED',
  validatedRevision: 2,
  category: 'GRAMMAR',
  position: 0,
  title: '기본 어순',
  summary: '요약',
};

const selectResults = [
  [{ conceptId: 'concept-1' }],
  [{ currentPublishedVersionId: 'old-version' }],
  [{ id: 'version-1', conceptId: 'concept-1' }],
  [{ sentenceVersionId: 'sentence-1' }],
  [{ id: 'sentence-1', mediaAssetId: 'sentence-media-1' }],
  [],
  [],
  [{ id: 'sentence-media-1' }],
  [candidateVersion],
  [
    {
      id: 'block-1',
      kind: 'THAI_EXAMPLES',
      position: 0,
      heading: '예시',
      paragraphs: null,
      tableHeaders: null,
      tableRows: null,
    },
  ],
  [
    {
      blockId: 'block-1',
      position: 0,
      sentenceVersionId: 'sentence-1',
      noteKo: null,
      sentenceId: 'sentence-1',
      mediaAssetId: 'sentence-media-1',
      audioAssetStatus: 'READY',
    },
  ],
  [],
  [],
  [{ sentenceVersionId: 'sentence-1' }],
];

const createChain = (result: unknown, event?: () => void) => {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    for: vi.fn(),
    limit: vi.fn(),
    set: vi.fn(),
    returning: vi.fn(),
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.for.mockImplementation(() => {
    event?.();
    return chain;
  });
  chain.limit.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.returning.mockReturnValue(chain);
  return chain;
};

const createPublishSession = (failCurrent = false) => {
  const events: string[] = [];
  let selectIndex = 0;
  let updateIndex = 0;
  const updateResults = [
    [{ id: 'old-version' }],
    [{ id: 'version-1' }],
    failCurrent ? [] : [{ id: 'concept-1' }],
    [],
  ];
  const session = {
    select: vi.fn(() => {
      const index = selectIndex++;
      return createChain(selectResults[index], () =>
        events.push(`lock:${index}`),
      );
    }),
    update: vi.fn(() => {
      const index = updateIndex++;
      const result = updateResults[index];
      const chain = createChain(result);
      chain.set.mockImplementation((values) => {
        const status = values.status ?? (values.frozenAt ? 'FROZEN' : 'UPDATE');
        events.push(`update:${status}`);
        return chain;
      });
      chain.returning = vi.fn().mockResolvedValue(result);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn((values) => {
        events.push(`audit:${values.action}`);
        return Promise.resolve();
      }),
    })),
  };
  return { events, session };
};

describe('DrizzleConceptAdminRepository 게시 transaction', () => {
  it('참조 graph 잠금 뒤 교체·동결·감사를 한 transaction에 완료한다', async () => {
    const { events, session } = createPublishSession();
    const database = {
      transaction: vi.fn((work: (value: typeof session) => Promise<void>) =>
        work(session),
      ),
    };
    const repository = new DrizzleConceptAdminRepository(database as never);

    await repository.publish(
      { versionId: 'version-1', expectedRevision: 2 },
      context,
    );

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(events).toEqual(
      expect.arrayContaining([
        'lock:1',
        'lock:2',
        'lock:4',
        'lock:5',
        'lock:6',
        'lock:7',
        'update:RETIRED',
        'update:PUBLISHED',
        'update:PUBLISHED',
        'update:FROZEN',
        'audit:CONCEPT_VERSION_PUBLISHED',
      ]),
    );
    expect(events.indexOf('lock:7')).toBeLessThan(
      events.indexOf('update:RETIRED'),
    );
    expect(events.at(-1)).toBe('audit:CONCEPT_VERSION_PUBLISHED');
  });

  it('현재 버전 교체가 실패하면 동결·감사 전에 transaction을 거부한다', async () => {
    const { events, session } = createPublishSession(true);
    let rolledBack = false;
    const database = {
      transaction: vi.fn(
        async (work: (value: typeof session) => Promise<void>) => {
          try {
            await work(session);
          } catch (error) {
            rolledBack = true;
            throw error;
          }
        },
      ),
    };
    const repository = new DrizzleConceptAdminRepository(database as never);

    await expect(
      repository.publish(
        { versionId: 'version-1', expectedRevision: 2 },
        context,
      ),
    ).rejects.toMatchObject({ code: 'CONCEPT_PERSISTENCE_CONFLICT' });
    expect(rolledBack).toBe(true);
    expect(events).not.toContain('update:FROZEN');
    expect(events).not.toContain('audit:CONCEPT_VERSION_PUBLISHED');
  });
});
