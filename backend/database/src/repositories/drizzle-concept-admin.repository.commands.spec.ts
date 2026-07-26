/** 개념 repository command의 성공·경쟁 경로를 검증한다 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleConceptAdminRepository } from './drizzle-concept-admin.repository.js';

const context = {
  actorSub: 'admin-sub',
  actorUserId: '11111111-1111-4111-8111-111111111111',
  requestId: 'request-1',
  occurredAt: new Date('2026-07-26T00:00:00.000Z'),
};

const version = {
  id: 'version-1',
  conceptId: 'concept-1',
  revision: 0,
  status: 'DRAFT',
  validationStatus: 'PENDING',
  validatedRevision: null,
  category: 'GRAMMAR',
  position: 0,
  title: '기본 어순',
  summary: '요약',
};

const chain = (result: unknown) => {
  const value = {
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
      resolve: (input: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  value.from.mockReturnValue(value);
  value.innerJoin.mockReturnValue(value);
  value.leftJoin.mockReturnValue(value);
  value.where.mockReturnValue(value);
  value.orderBy.mockReturnValue(value);
  value.for.mockReturnValue(value);
  value.limit.mockReturnValue(value);
  value.set.mockReturnValue(value);
  value.returning.mockResolvedValue(result);
  return value;
};

const commandSession = (
  selects: unknown[],
  updates: unknown[] = [],
  events: string[] = [],
) => {
  let selectIndex = 0;
  let updateIndex = 0;
  return {
    select: vi.fn(() => chain(selects[selectIndex++])),
    insert: vi.fn(() => ({
      values: vi.fn((input) => {
        if (input.action) events.push(`audit:${input.action}`);
        else events.push('insert');
        return Promise.resolve();
      }),
    })),
    update: vi.fn(() => {
      const result = updates[updateIndex++];
      const value = chain(result);
      value.set.mockImplementation(() => {
        events.push('update');
        return value;
      });
      return value;
    }),
    delete: vi.fn(() => {
      const value = chain([]);
      value.where.mockImplementation(() => {
        events.push('delete');
        return value;
      });
      return value;
    }),
  };
};

const databaseFor = <T extends object>(session: T) => ({
  transaction: vi.fn((work: (value: T) => Promise<unknown>) => work(session)),
});

describe('DrizzleConceptAdminRepository command', () => {
  it('논리 개념과 첫 초안을 생성하고 감사를 남긴다', async () => {
    const events: string[] = [];
    const session = commandSession([[version], [], []], [], events);
    const database = databaseFor(session);
    const repository = new DrizzleConceptAdminRepository(database as never);

    const created = await repository.createConcept(
      {
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '요약',
        blocks: [],
      },
      context,
    );

    expect(created).toMatchObject({ version: 1, title: '기본 어순' });
    expect(events).toContain('audit:CONCEPT_CREATED');
    expect(database.transaction).toHaveBeenCalledOnce();
  });

  it('최신 버전을 다음 초안으로 복제한다', async () => {
    const events: string[] = [];
    const nextVersion = { ...version, id: 'version-2' };
    const session = commandSession(
      [
        [{ id: 'concept-1' }],
        [{ id: 'version-1', version: 1, status: 'PUBLISHED' }],
        [version],
        [],
        [],
        [nextVersion],
        [],
        [],
      ],
      [],
      events,
    );
    const repository = new DrizzleConceptAdminRepository(
      databaseFor(session) as never,
    );

    const created = await repository.createNextDraft('concept-1', context);

    expect(created.version).toBe(2);
    expect(events).toContain('audit:CONCEPT_VERSION_CREATED');
  });

  it('revision이 맞는 초안을 교체하고 검증 상태를 초기화한다', async () => {
    const events: string[] = [];
    const replaced = { ...version, revision: 1 };
    const session = commandSession(
      [[], [replaced], [], []],
      [[{ version: 1 }]],
      events,
    );
    const repository = new DrizzleConceptAdminRepository(
      databaseFor(session) as never,
    );

    const result = await repository.replaceDraft(
      'version-1',
      {
        revision: 0,
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '수정 요약',
        blocks: [],
      },
      context,
    );

    expect(result.revision).toBe(1);
    expect(events).toEqual(
      expect.arrayContaining([
        'update',
        'delete',
        'audit:CONCEPT_VERSION_REPLACED',
      ]),
    );
  });

  it('검증 저장 중 revision 경쟁을 감지하고 감사를 남기지 않는다', async () => {
    const events: string[] = [];
    const session = commandSession([], [[]], events);
    const repository = new DrizzleConceptAdminRepository(
      databaseFor(session) as never,
    );

    await expect(
      repository.saveValidation(
        {
          versionId: 'version-1',
          expectedRevision: 0,
          issues: [],
          validatedAt: context.occurredAt,
        },
        context,
      ),
    ).rejects.toMatchObject({ code: 'CONCEPT_REVISION_CONFLICT' });
    expect(events).not.toContain('audit:CONCEPT_VERSION_VALIDATED');
  });

  it('숨김 개념을 현재 게시 버전 확인 후 복구하고 감사를 남긴다', async () => {
    const events: string[] = [];
    const session = commandSession(
      [
        [
          {
            id: 'concept-1',
            status: 'HIDDEN',
            currentPublishedVersionId: 'version-1',
          },
        ],
        [{ id: 'version-1', status: 'PUBLISHED' }],
      ],
      [[{ id: 'concept-1' }]],
      events,
    );
    const repository = new DrizzleConceptAdminRepository(
      databaseFor(session) as never,
    );

    await repository.restore('concept-1', context);

    expect(events).toContain('audit:CONCEPT_RESTORED');
  });
});
