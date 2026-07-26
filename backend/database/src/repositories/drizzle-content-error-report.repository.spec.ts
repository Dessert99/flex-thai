/** 콘텐츠 오류 신고 adapter의 concept 격리와 원자 생성 저장을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { auditLogs } from '../schema/identity.schema.js';
import {
  contentErrorReportHistory,
  contentErrorReports,
} from '../schema/feedback.schema.js';
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
        questionVersionId: null,
        sentenceVersionId: null,
        mediaAssetId: null,
        locationId: null,
      },
      snapshot: {
        title: '문법',
        primaryText: '기본 어순',
        secondaryText: null,
        versionLabel: '버전 1',
        locationLabel: '개념 상세',
        audioAssetId: null,
      },
    };
    const lookup = {
      resolve: vi.fn().mockResolvedValue(resolved),
      resolveSentence: vi.fn(),
      resolveSentenceAudio: vi.fn(),
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
          contentVersionId: 'version-id',
          questionVersionId: null,
          sentenceVersionId: null,
          mediaAssetId: null,
          locationId: null,
          internalStatus: 'DRAFT',
        },
        snapshot: {
          title: '문법',
          primaryText: '기본 어순',
          secondaryText: null,
          versionLabel: '버전 1',
          locationLabel: '개념 상세',
          audioAssetId: null,
        },
      }),
      resolveSentence: vi.fn(),
      resolveSentenceAudio: vi.fn(),
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
          contentVersionId: 'version-id',
          questionVersionId: null,
          sentenceVersionId: null,
          mediaAssetId: null,
          locationId: null,
        },
        snapshot: {
          title: '문법',
          primaryText: '기본 어순',
          secondaryText: null,
          versionLabel: '버전 1',
          locationLabel: '개념 상세',
          audioAssetId: null,
        },
      }),
      resolveSentence: vi.fn(),
      resolveSentenceAudio: vi.fn(),
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
        questionVersionId: 'version-id',
        blockId: null,
        sentenceVersionId: 'sentence-id',
      }),
    ).resolves.toBeNull();
  });

  it('위치 없는 문제 신고는 임의 문장을 선택하지 않고 문제 버전 자체를 snapshot한다', async () => {
    const database = createSelectDatabase([[{ version: 3 }]]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );

    await expect(
      repository.resolve({
        kind: 'QUESTION',
        questionId: 'question-id',
        questionVersionId: 'version-id',
        blockId: null,
        sentenceVersionId: null,
      }),
    ).resolves.toMatchObject({
      reference: {
        contentId: 'question-id',
        contentVersionId: 'version-id',
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

  it('blockId만 있으면 공개 block의 모든 문장을 position 순서로 snapshot한다', async () => {
    const database = createSelectDatabase([
      [{ version: 1 }],
      [
        {
          blockId: 'block-id',
          kind: 'PASSAGE',
          blockPosition: 2,
          sentencePosition: 0,
          sentenceVersionId: 'sentence-1',
          originalText: '첫 문장',
          translationKo: '첫 해석',
          mediaAssetId: 'media-1',
        },
        {
          blockId: 'block-id',
          kind: 'PASSAGE',
          blockPosition: 2,
          sentencePosition: 1,
          sentenceVersionId: 'sentence-2',
          originalText: '둘째 문장',
          translationKo: '둘째 해석',
          mediaAssetId: 'media-2',
        },
      ],
    ]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );

    await expect(
      repository.resolve({
        kind: 'QUESTION',
        questionId: 'question-id',
        questionVersionId: 'version-id',
        blockId: 'block-id',
        sentenceVersionId: null,
      }),
    ).resolves.toMatchObject({
      reference: {
        sentenceVersionId: null,
        locationId: 'block-id',
        mediaAssetId: null,
      },
      snapshot: {
        title: '첫 문장\n둘째 문장',
        primaryText: '첫 해석\n둘째 해석',
        locationLabel: 'PASSAGE 블록 3',
        audioAssetId: null,
      },
    });
    const blockWhere = database.whereCalls[1];
    const query = new PgDialect().sqlToQuery(blockWhere as never);
    expect(query.params).toContain('EXPLANATION');
    expect(query.sql).toContain('<>');
  });

  it.each([
    ['sentenceVersionId', '일반 선택지'],
    ['spanSentenceVersionId', 'inline 선택지'],
  ] as const)(
    '문제 선택지의 %s 관계를 정확히 snapshot한다',
    async (field, label) => {
      const database = createSelectDatabase([
        [{ version: 1 }],
        [],
        [
          {
            optionId: 'option-id',
            optionPosition: 2,
            sentenceVersionId: 'sentence-id',
            originalText: label,
            translationKo: '선택지 해석',
            mediaAssetId: 'media-id',
          },
        ],
      ]);
      const repository = new DrizzleContentErrorReportRepository(
        database as never,
      );

      await expect(
        repository.resolve({
          kind: 'QUESTION',
          questionId: 'question-id',
          questionVersionId: 'version-id',
          blockId: null,
          sentenceVersionId: 'sentence-id',
        }),
      ).resolves.toMatchObject({
        reference: {
          sentenceVersionId: 'sentence-id',
          locationId: 'option-id',
        },
        snapshot: {
          title: label,
          locationLabel: '선택지 3',
        },
      });
      const optionWhere = database.whereCalls[2];
      const query = new PgDialect().sqlToQuery(optionWhere as never);
      expect(query.sql).toContain(
        field === 'sentenceVersionId'
          ? '"sentence_version_id"'
          : '"span_sentence_version_id"',
      );
    },
  );

  it('blockId가 지정되면 다른 위치의 선택지 문장으로 대체하지 않는다', async () => {
    const database = createSelectDatabase([
      [{ version: 1 }],
      [],
      [{ originalText: '선택지', translationKo: '오답', mediaAssetId: 'm' }],
    ]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'QUESTION',
        questionId: 'question-id',
        questionVersionId: 'version-id',
        blockId: 'block-id',
        sentenceVersionId: 'sentence-id',
      }),
    ).resolves.toBeNull();
    expect(database.select).toHaveBeenCalledTimes(2);
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
        pronunciationId: null,
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
          pronunciationKo: '타이',
          mediaAssetId: 'media-id',
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
        questionVersionId: null,
        sentenceVersionId: 'sentence-version-id',
        mediaAssetId: null,
        locationId: null,
      },
      snapshot: {
        title: '개념 문장',
        primaryText: '개념 해석',
        secondaryText: null,
        versionLabel: '버전 1',
        locationLabel: '개념 예문',
        audioAssetId: null,
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
          pronunciationKo: null,
          mediaAssetId: null,
          frozenAt: new Date(),
        },
      ],
      [],
      [],
    ]);
    const lookup = {
      resolve: vi.fn(),
      resolveSentence: vi.fn().mockResolvedValue(resolved),
      resolveSentenceAudio: vi.fn(),
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

  it('concept 문장 음성 lookup의 strict AUDIO target만 허용한다', async () => {
    const resolved = {
      reference: {
        kind: 'AUDIO' as const,
        contentId: 'media-id',
        contentVersionId: 'sentence-version-id',
        questionVersionId: null,
        sentenceVersionId: 'sentence-version-id',
        mediaAssetId: 'media-id',
        locationId: null,
      },
      snapshot: {
        title: '개념 문장 음성',
        primaryText: '개념 문장',
        secondaryText: null,
        versionLabel: '버전 1',
        locationLabel: '개념 예문',
        audioAssetId: 'media-id',
      },
    };
    const database = createSelectDatabase([[]]);
    const lookup = {
      resolve: vi.fn(),
      resolveSentence: vi.fn(),
      resolveSentenceAudio: vi.fn().mockResolvedValue(resolved),
    };
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
      lookup,
    );

    await expect(
      repository.resolve({
        kind: 'AUDIO',
        source: {
          kind: 'SENTENCE',
          sentenceVersionId: 'sentence-version-id',
        },
      }),
    ).resolves.toEqual(resolved);
  });

  it('concept 문장 음성 lookup의 추가 key와 다른 sentence 관계를 거부한다', async () => {
    const database = createSelectDatabase([[]]);
    const lookup = {
      resolve: vi.fn(),
      resolveSentence: vi.fn(),
      resolveSentenceAudio: vi.fn().mockResolvedValue({
        reference: {
          kind: 'AUDIO',
          contentId: 'media-id',
          contentVersionId: 'other-sentence-version-id',
          questionVersionId: null,
          sentenceVersionId: 'other-sentence-version-id',
          mediaAssetId: 'media-id',
          locationId: null,
        },
        snapshot: {
          title: '개념 문장 음성',
          primaryText: '개념 문장',
          secondaryText: null,
          versionLabel: '버전 1',
          locationLabel: '개념 예문',
          audioAssetId: 'media-id',
          storageKey: 'private/audio.mp3',
        },
      }),
    };
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
      lookup,
    );

    await expect(
      repository.resolve({
        kind: 'AUDIO',
        source: {
          kind: 'SENTENCE',
          sentenceVersionId: 'sentence-version-id',
        },
      }),
    ).resolves.toBeNull();
  });

  it('일반·inline 선택지에 노출된 문장을 공개 SENTENCE 대상으로 허용한다', async () => {
    const sentence = {
      id: 'sentence-version-id',
      sentenceId: 'sentence-id',
      version: 1,
      originalText: '선택지 문장',
      translationKo: '선택지 해석',
      pronunciationKo: null,
      mediaAssetId: null,
      frozenAt: new Date(),
    };
    const database = createSelectDatabase([[sentence], [], [{ id: 'qv-id' }]]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );

    await expect(
      repository.resolve({
        kind: 'SENTENCE',
        sentenceVersionId: 'sentence-version-id',
        tokenPosition: null,
      }),
    ).resolves.toMatchObject({
      reference: {
        kind: 'SENTENCE',
        sentenceVersionId: 'sentence-version-id',
      },
    });
  });

  it('문장 공개 block 검사는 EXPLANATION을 제외한다', async () => {
    const sentence = {
      id: 'sentence-version-id',
      sentenceId: 'sentence-id',
      version: 1,
      originalText: '문장',
      translationKo: '해석',
      pronunciationKo: null,
      mediaAssetId: null,
      frozenAt: new Date(),
    };
    const database = createSelectDatabase([[sentence], [{ questionId: 'q' }]]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );

    await repository.resolve({
      kind: 'SENTENCE',
      sentenceVersionId: 'sentence-version-id',
      tokenPosition: null,
    });

    const exposureWhere = database.whereCalls[1];
    const query = new PgDialect().sqlToQuery(exposureWhere as never);
    expect(query.params).toContain('EXPLANATION');
    expect(query.sql).toContain('<>');
  });

  it('READY가 아닌 어휘 발음은 상세 신고에서도 거부한다', async () => {
    const database = createSelectDatabase([
      [{ thai: 'ไทย' }],
      [
        {
          value: '타이',
          mediaAssetId: 'media-id',
          mediaStatus: 'PROCESSING',
        },
      ],
    ]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'VOCABULARY',
        vocabularyId: 'vocabulary-id',
        meaningId: null,
        pronunciationId: 'pronunciation-id',
      }),
    ).resolves.toBeNull();
  });

  it('READY가 아닌 어휘 음성을 거부한다', async () => {
    const database = createSelectDatabase([
      [
        {
          vocabularyId: 'vocabulary-id',
          thai: 'ไทย',
          pronunciation: '타이',
          mediaAssetId: 'media-id',
          mediaStatus: 'REJECTED',
        },
      ],
    ]);
    const repository = new DrizzleContentErrorReportRepository(
      database as never,
    );
    await expect(
      repository.resolve({
        kind: 'AUDIO',
        source: { kind: 'VOCABULARY', pronunciationId: 'pronunciation-id' },
      }),
    ).resolves.toBeNull();
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
