/** 콘텐츠 오류 신고 adapter의 concept 격리와 원자 생성 저장을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  contentErrorReportHistory,
  contentErrorReports,
} from '../schema/feedback.schema.js';
import { auditLogs } from '../schema/identity.schema.js';
import { DrizzleContentErrorReportRepository } from './drizzle-content-error-report.repository.js';

const createSelectDatabase = (responses: unknown[][]) => {
  const whereCalls: unknown[] = [];
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'orderBy',
      'limit',
      'for',
    ]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.where = vi.fn((condition: unknown) => {
      whereCalls.push(condition);
      return chain;
    });
    chain.then = (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(responses.shift() ?? []).then(resolve);
    return chain;
  });
  return { select, whereCalls };
};

const createWorkflowDatabase = (
  selectResponses: unknown[][],
  updated: unknown[],
) => {
  const locks: string[] = [];
  const updateWhere: unknown[] = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const transaction = {
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const method of ['from', 'where', 'limit']) {
        chain[method] = vi.fn(() => chain);
      }
      chain.for = vi.fn((mode: string) => {
        locks.push(mode);
        return Promise.resolve(selectResponses.shift() ?? []);
      });
      return chain;
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn((condition: unknown) => {
          updateWhere.push(condition);
          return {
            returning: vi.fn().mockResolvedValue(updated),
          };
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        inserts.push({ table, values });
        return Promise.resolve();
      }),
    })),
  };
  return {
    database: {
      transaction: (run: (tx: unknown) => unknown) => run(transaction),
    },
    inserts,
    locks,
    transaction,
    updateWhere,
  };
};

describe('DrizzleContentErrorReportRepository', () => {
  it('concept schema를 알지 않고 주입 lookup으로만 대상을 해석한다', async () => {
    const resolved = {
      reference: {
        kind: 'CONCEPT' as const,
        contentId: 'concept-id',
        contentVersionId: 'version-id',
        questionVersion: null,
        sentenceVersionId: null,
        locationId: null,
      },
      snapshot: {
        title: '문법',
        primaryText: '기본 어순',
        secondaryText: null,
        versionLabel: '버전 1',
        locationLabel: '개념 상세',
      },
    };
    const lookup = {
      resolve: vi.fn().mockResolvedValue(resolved),
      resolveSentence: vi.fn(),
    };
    const repository = new DrizzleContentErrorReportRepository(
      {} as never,
      lookup,
    );
    await expect(
      repository.resolve({
        kind: 'CONCEPT',
        conceptId: 'concept-id',
        conceptVersionId: 'version-id',
        blockId: null,
      }),
    ).resolves.toEqual(resolved);
    expect(lookup.resolve).toHaveBeenCalledOnce();
  });

  it('concept lookup 반환에 추가 key가 있으면 canonical target으로 저장하지 않는다', async () => {
    const lookup = {
      resolve: vi.fn().mockResolvedValue({
        reference: {
          kind: 'CONCEPT',
          contentId: 'concept-id',
          contentVersionId: null,
          questionVersion: null,
          sentenceVersionId: null,
          locationId: null,
          internalStatus: 'DRAFT',
        },
        snapshot: {
          title: '문법',
          primaryText: '기본 어순',
          secondaryText: null,
          versionLabel: '버전 1',
          locationLabel: '개념 상세',
        },
      }),
      resolveSentence: vi.fn(),
    };
    const repository = new DrizzleContentErrorReportRepository(
      {} as never,
      lookup,
    );

    await expect(
      repository.resolve({
        kind: 'CONCEPT',
        conceptId: 'concept-id',
        conceptVersionId: 'version-id',
        blockId: null,
      }),
    ).resolves.toBeNull();
  });

  it('concept lookup이 다른 canonical ID를 반환하면 대상을 거부한다', async () => {
    const lookup = {
      resolve: vi.fn().mockResolvedValue({
        reference: {
          kind: 'CONCEPT',
          contentId: 'other-concept-id',
          contentVersionId: null,
          questionVersion: null,
          sentenceVersionId: null,
          locationId: null,
        },
        snapshot: {
          title: '문법',
          primaryText: '기본 어순',
          secondaryText: null,
          versionLabel: '버전 1',
          locationLabel: '개념 상세',
        },
      }),
      resolveSentence: vi.fn(),
    };
    const repository = new DrizzleContentErrorReportRepository(
      {} as never,
      lookup,
    );

    await expect(
      repository.resolve({
        kind: 'CONCEPT',
        conceptId: 'concept-id',
        conceptVersionId: 'version-id',
        blockId: null,
      }),
    ).resolves.toBeNull();
  });

  it('concept lookup이 연결되지 않으면 대상을 사용할 수 없다', async () => {
    const repository = new DrizzleContentErrorReportRepository({} as never);
    await expect(
      repository.resolve({
        kind: 'CONCEPT',
        conceptId: 'concept-id',
        conceptVersionId: 'version-id',
        blockId: null,
      }),
    ).resolves.toBeNull();
  });

  it('문제 문장 관계가 없으면 sentenceVersionId를 저장하지 않는다', async () => {
    const database = createSelectDatabase([[{ version: 1 }], []]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'QUESTION',
        questionId: 'question-id',
        questionVersion: 1,
        blockId: null,
        sentenceVersionId: 'sentence-id',
      }),
    ).resolves.toBeNull();
  });

  it('위치 없는 문제 신고는 임의 문장을 선택하지 않고 문제 버전 자체를 snapshot한다', async () => {
    const database = createSelectDatabase([
      [{ version: 3, prompt: 'question-id', passage: null }],
    ]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );

    await expect(
      repository.resolve({
        kind: 'QUESTION',
        questionId: 'question-id',
        questionVersion: 1,
        blockId: null,
        sentenceVersionId: null,
      }),
    ).resolves.toMatchObject({
      reference: {
        contentId: 'question-id',
        contentVersionId: null,
        sentenceVersionId: null,
        locationId: null,
      },
      snapshot: {
        title: '문제',
        primaryText: 'question-id',
        versionLabel: '버전 3',
        locationLabel: '문제 전체',
      },
    });
    expect(database.select).toHaveBeenCalledOnce();
  });

  it('어휘 뜻 소유 관계가 다르면 대상을 거부한다', async () => {
    const database = createSelectDatabase([[{ thai: 'ไทย' }], []]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'VOCABULARY',
        vocabularyId: 'vocabulary-id',
        meaningId: 'other-meaning-id',
      }),
    ).resolves.toBeNull();
  });

  it('문장 노출 관계가 없으면 대상을 거부한다', async () => {
    const database = createSelectDatabase([
      [
        {
          id: 'sentence-version-id',
          sentenceId: 'sentence-id',
          version: 1,
          originalText: 'ไทย',
          translationKo: '태국어',
          frozenAt: new Date(),
        },
      ],
      [],
    ]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'SENTENCE',
        sentenceVersionId: 'sentence-version-id',
        tokenPosition: null,
      }),
    ).resolves.toBeNull();
  });

  it('문제 노출이 없는 문장은 concept 공개 lookup으로 해석한다', async () => {
    const resolved = {
      reference: {
        kind: 'SENTENCE' as const,
        contentId: 'sentence-id',
        contentVersionId: 'sentence-version-id',
        questionVersion: null,
        sentenceVersionId: 'sentence-version-id',
        locationId: null,
      },
      snapshot: {
        title: '개념 문장',
        primaryText: '개념 해석',
        secondaryText: null,
        versionLabel: '버전 1',
        locationLabel: '개념 예문',
      },
    };
    const database = createSelectDatabase([
      [
        {
          id: 'sentence-version-id',
          sentenceId: 'sentence-id',
          version: 1,
          originalText: '개념 문장',
          translationKo: '개념 해석',
          frozenAt: new Date(),
        },
      ],
      [],
      [],
    ]);
    const lookup = {
      resolve: vi.fn(),
      resolveSentence: vi.fn().mockResolvedValue(resolved),
    };
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
      lookup,
    );
    await expect(
      repository.resolve({
        kind: 'SENTENCE',
        sentenceVersionId: 'sentence-version-id',
        tokenPosition: 2,
      }),
    ).resolves.toEqual(resolved);
    expect(lookup.resolveSentence).toHaveBeenCalledWith({
      sentenceVersionId: 'sentence-version-id',
      tokenPosition: 2,
    });
  });

  it('신고와 SUBMITTED 이력을 한 transaction에 저장하고 중복 신고도 허용한다', async () => {
    const inserted: Array<{ table: unknown; values: unknown }> = [];
    let sequence = 0;
    const transaction = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserted.push({ table, values });
          return table === contentErrorReports
            ? {
                returning: vi.fn().mockResolvedValue([
                  {
                    id: `report-${++sequence}`,
                    reporterUserId: 'user-id',
                    targetKind: 'VOCABULARY',
                    category: 'OTHER',
                    status: 'OPEN',
                    assigneeUserId: null,
                    description: null,
                    canonicalReference: {},
                    snapshot: {},
                    createdAt: new Date(0),
                    updatedAt: new Date(0),
                  },
                ]),
              }
            : Promise.resolve();
        }),
      })),
    };
    const database = {
      transaction: vi.fn((run: (tx: unknown) => unknown) => run(transaction)),
    };
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    const input = {
      reporterUserId: 'user-id',
      target: {
        reference: { kind: 'VOCABULARY' },
        snapshot: {},
      },
      category: 'OTHER',
      description: null,
      createdAt: new Date(0),
    } as never;
    await repository.create(input);
    await repository.create(input);
    expect(
      inserted.filter(({ table }) => table === contentErrorReports),
    ).toHaveLength(2);
    expect(
      inserted.filter(({ table }) => table === contentErrorReportHistory),
    ).toHaveLength(2);
    expect(inserted[1]?.values).toMatchObject({ action: 'SUBMITTED' });
  });

  it('상태 변경은 이력과 actorSub audit을 함께 저장한다', async () => {
    const current = {
      id: 'report-id',
      status: 'OPEN',
      assigneeUserId: null,
      updatedAt: new Date(0),
    };
    const updated = {
      id: 'report-id',
      reporterUserId: 'user-id',
      targetKind: 'QUESTION',
      category: 'OTHER',
      status: 'IN_PROGRESS',
      assigneeUserId: null,
      description: null,
      canonicalReference: {},
      snapshot: {},
      createdAt: new Date(0),
      updatedAt: new Date(1),
    };
    const fake = createWorkflowDatabase([[current]], [updated]);
    const repository = new DrizzleContentErrorReportRepository(
      fake.database as never,
    );
    await repository.changeStatus({
      reportId: 'report-id',
      fromStatus: 'OPEN',
      toStatus: 'IN_PROGRESS',
      expectedUpdatedAt: new Date(0),
      changedAt: new Date(1),
      actor: {
        userId: 'admin-id',
        actorSub: 'admin-sub',
        requestId: 'request-id',
      },
    });
    expect(
      fake.inserts.find(({ table }) => table === contentErrorReportHistory)
        ?.values,
    ).toMatchObject({ action: 'STATUS_CHANGED', fromStatus: 'OPEN' });
    expect(
      fake.inserts.find(({ table }) => table === auditLogs)?.values,
    ).toMatchObject({ actorSub: 'admin-sub', requestId: 'request-id' });
  });

  it('담당자 배정은 ACTIVE ADMIN과 report를 같은 transaction에서 잠근다', async () => {
    const current = {
      id: 'report-id',
      status: 'OPEN',
      assigneeUserId: null,
      updatedAt: new Date(0),
    };
    const updated = {
      ...current,
      reporterUserId: 'user-id',
      targetKind: 'QUESTION',
      category: 'OTHER',
      assigneeUserId: 'admin-id',
      description: null,
      canonicalReference: {},
      snapshot: {},
      createdAt: new Date(0),
      updatedAt: new Date(1),
    };
    const fake = createWorkflowDatabase(
      [[{ id: 'admin-id', role: 'ADMIN', status: 'ACTIVE' }], [current]],
      [updated],
    );
    const repository = new DrizzleContentErrorReportRepository(
      fake.database as never,
    );

    await repository.changeAssignee({
      reportId: 'report-id',
      fromAssigneeUserId: null,
      toAssigneeUserId: 'admin-id',
      expectedUpdatedAt: new Date(0),
      changedAt: new Date(1),
      actor: {
        userId: 'actor-id',
        actorSub: 'actor-sub',
        requestId: 'request-id',
      },
    });

    expect(fake.locks).toEqual(['update', 'update']);
    expect(fake.transaction.update).toHaveBeenCalledOnce();
  });

  it('transaction 안에서 배정 대상이 ACTIVE ADMIN이 아니면 이력 없이 거부한다', async () => {
    const fake = createWorkflowDatabase([[]], []);
    const repository = new DrizzleContentErrorReportRepository(
      fake.database as never,
    );

    await expect(
      repository.changeAssignee({
        reportId: 'report-id',
        fromAssigneeUserId: null,
        toAssigneeUserId: 'admin-id',
        expectedUpdatedAt: new Date(0),
        changedAt: new Date(1),
        actor: {
          userId: 'actor-id',
          actorSub: 'actor-sub',
          requestId: 'request-id',
        },
      }),
    ).rejects.toMatchObject({
      code: 'CONTENT_ERROR_REPORT_ASSIGNEE_UNAVAILABLE',
    });
    expect(fake.transaction.update).not.toHaveBeenCalled();
    expect(fake.inserts).toHaveLength(0);
  });

  it.each([
    ['상태', { status: 'IN_PROGRESS', assigneeUserId: null }],
    ['담당자', { status: 'OPEN', assigneeUserId: 'other-admin' }],
  ] as const)(
    '잠근 report의 이전 %s가 요청과 다르면 workflow를 기록하지 않는다',
    async (_label, currentPatch) => {
      const current = {
        id: 'report-id',
        updatedAt: new Date(0),
        ...currentPatch,
      };
      const fake = createWorkflowDatabase([[current]], []);
      const repository = new DrizzleContentErrorReportRepository(
        fake.database as never,
      );
      const result =
        currentPatch.status === 'IN_PROGRESS'
          ? await repository.changeStatus({
              reportId: 'report-id',
              fromStatus: 'OPEN',
              toStatus: 'RESOLVED',
              expectedUpdatedAt: new Date(0),
              changedAt: new Date(1),
              actor: {
                userId: 'actor-id',
                actorSub: 'actor-sub',
                requestId: 'request-id',
              },
            })
          : await repository.changeAssignee({
              reportId: 'report-id',
              fromAssigneeUserId: null,
              toAssigneeUserId: null,
              expectedUpdatedAt: new Date(0),
              changedAt: new Date(1),
              actor: {
                userId: 'actor-id',
                actorSub: 'actor-sub',
                requestId: 'request-id',
              },
            });

      expect(result).toBeNull();
      expect(fake.transaction.update).not.toHaveBeenCalled();
      expect(fake.inserts).toHaveLength(0);
    },
  );

  it.each([
    ['history', contentErrorReportHistory, 1],
    ['audit', auditLogs, 2],
  ] as const)(
    '%s 저장이 실패하면 transaction 오류를 전파해 commit하지 않는다',
    async (label, failingTable, insertCount) => {
      const current = {
        id: 'report-id',
        status: 'OPEN',
        assigneeUserId: null,
        updatedAt: new Date(0),
      };
      const updated = {
        ...current,
        reporterUserId: 'user-id',
        targetKind: 'QUESTION',
        category: 'OTHER',
        status: 'IN_PROGRESS',
        description: null,
        canonicalReference: {},
        snapshot: {},
        createdAt: new Date(0),
        updatedAt: new Date(1),
      };
      const fake = createWorkflowDatabase([[current]], [updated]);
      fake.transaction.insert.mockImplementation((table: unknown) => ({
        values: vi.fn(() =>
          table === failingTable
            ? Promise.reject(new Error(`${label} failed`))
            : Promise.resolve(),
        ),
      }));
      const repository = new DrizzleContentErrorReportRepository(
        fake.database as never,
      );

      await expect(
        repository.changeStatus({
          reportId: 'report-id',
          fromStatus: 'OPEN',
          toStatus: 'IN_PROGRESS',
          expectedUpdatedAt: new Date(0),
          changedAt: new Date(1),
          actor: {
            userId: 'actor-id',
            actorSub: 'actor-sub',
            requestId: 'request-id',
          },
        }),
      ).rejects.toThrow(`${label} failed`);
      expect(fake.transaction.insert).toHaveBeenCalledTimes(insertCount);
    },
  );

  it('stale update이면 이력과 audit을 남기지 않는다', async () => {
    const stale = {
      id: 'report-id',
      status: 'OPEN',
      assigneeUserId: null,
      updatedAt: new Date(2),
    };
    const fake = createWorkflowDatabase(
      [[{ id: 'admin-id', role: 'ADMIN', status: 'ACTIVE' }], [stale]],
      [],
    );
    const repository = new DrizzleContentErrorReportRepository(
      fake.database as never,
    );
    await expect(
      repository.changeAssignee({
        reportId: 'report-id',
        fromAssigneeUserId: null,
        toAssigneeUserId: 'admin-id',
        expectedUpdatedAt: new Date(0),
        changedAt: new Date(1),
        actor: {
          userId: 'admin-id',
          actorSub: 'admin-sub',
          requestId: 'request-id',
        },
      }),
    ).resolves.toBeNull();
    expect(fake.inserts).toHaveLength(0);
  });
});
