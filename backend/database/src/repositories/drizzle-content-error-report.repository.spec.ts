/** 콘텐츠 오류 신고 adapter의 concept 격리와 원자 생성 저장을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { auditLogs } from '../schema/identity.schema.js';
import {
  contentErrorReportHistory,
  contentErrorReports,
} from '../schema/feedback.schema.js';
import { DrizzleContentErrorReportRepository } from './drizzle-content-error-report.repository.js';

const createSelectDatabase = (responses: unknown[][]) => {
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'limit']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(responses.shift() ?? []).then(resolve);
    return chain;
  });
  return { select };
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
      reference: { kind: 'SENTENCE' },
      snapshot: { title: '개념 문장' },
    };
    const database = createSelectDatabase([[{ frozenAt: new Date() }], []]);
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
    const inserted: Array<{ table: unknown; values: unknown }> = [];
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
    const transaction = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([updated]),
          })),
        })),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserted.push({ table, values });
          return Promise.resolve();
        }),
      })),
    };
    const repository = new DrizzleContentErrorReportRepository({
      transaction: (run: (tx: unknown) => unknown) => run(transaction),
    } as never);
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
      inserted.find(({ table }) => table === contentErrorReportHistory)?.values,
    ).toMatchObject({ action: 'STATUS_CHANGED', fromStatus: 'OPEN' });
    expect(
      inserted.find(({ table }) => table === auditLogs)?.values,
    ).toMatchObject({ actorSub: 'admin-sub', requestId: 'request-id' });
  });

  it('stale update이면 이력과 audit을 남기지 않는다', async () => {
    const insert = vi.fn();
    const transaction = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      insert,
    };
    const repository = new DrizzleContentErrorReportRepository({
      transaction: (run: (tx: unknown) => unknown) => run(transaction),
    } as never);
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
    expect(insert).not.toHaveBeenCalled();
  });
});
