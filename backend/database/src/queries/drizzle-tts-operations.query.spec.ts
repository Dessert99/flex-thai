/** TTS 운영 조회가 stable page·집계·민감하지 않은 projection만 반환하는지 검증한다 */
import { desc } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { ttsItems, ttsJobs } from '../schema/tts.schema.js';
import { DrizzleTtsOperationsQuery } from './drizzle-tts-operations.query.js';

const ids = {
  job: '00000000-0000-4000-8000-000000000001',
  item: '00000000-0000-4000-8000-000000000002',
  requester: '00000000-0000-4000-8000-000000000003',
  media: '00000000-0000-4000-8000-000000000004',
  target: '00000000-0000-4000-8000-000000000006',
  version: '00000000-0000-4000-8000-000000000007',
} as const;

const voice = {
  presetId: '00000000-0000-4000-8000-000000000005',
  provider: 'local',
  model: 'deterministic-v1',
  voice: 'thai-female',
  locale: 'th-TH' as const,
  audioFormat: 'audio/wav' as const,
  generationRevision: '2026-07-27',
};

const jobRow = {
  id: ids.job,
  status: 'PARTIALLY_FAILED' as const,
  requestedBy: ids.requester,
  pendingCount: 1,
  processingCount: 2,
  succeededCount: 3,
  failedCount: 4,
  createdAt: new Date('2026-07-27T00:00:00.000Z'),
  startedAt: new Date('2026-07-27T00:01:00.000Z'),
  finishedAt: null,
  voiceSnapshot: voice,
};

const itemRow = {
  id: ids.item,
  targetKind: 'THAI_SENTENCE_VERSION' as const,
  targetId: '00000000-0000-4000-8000-000000000006',
  targetText: 'สวัสดี',
  targetRequired: true,
  revision: 'sentence-v1',
  status: 'FAILED' as const,
  attempt: 2,
  errorCode: 'TTS_PROVIDER_TIMEOUT',
  retryable: true,
  mediaAssetId: null,
};

const createDatabase = (results: Array<Array<Record<string, unknown>>>) => {
  const queue = [...results];
  const calls: Array<{
    fields: Record<string, unknown>;
    table?: unknown;
    orderBy?: unknown[];
    limit?: number;
    offset?: number;
  }> = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call: (typeof calls)[number] = { fields };
    calls.push(call);
    const consume = () => Promise.resolve(queue.shift() ?? []);
    const chain = {
      from: vi.fn((table: unknown) => {
        call.table = table;
        return chain;
      }),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
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
        return consume();
      }),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => consume().then(resolve, reject),
    };
    return chain;
  });
  return { calls, database: { select } };
};

describe('DrizzleTtsOperationsQuery 작업 목록', () => {
  it('상태·기간 조건의 aggregate count와 stable 최신순 page를 반환한다', async () => {
    const fake = createDatabase([[{ totalItems: 5 }], [jobRow]]);
    const query = new DrizzleTtsOperationsQuery(fake.database as never);

    await expect(
      query.listJobs({
        status: 'PARTIALLY_FAILED',
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-31T23:59:59.999Z'),
        page: 2,
        pageSize: 3,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: ids.job,
          status: 'PARTIALLY_FAILED',
          requestedBy: ids.requester,
          counts: { pending: 1, processing: 2, succeeded: 3, failed: 4 },
          createdAt: jobRow.createdAt,
          startedAt: jobRow.startedAt,
          finishedAt: null,
        },
      ],
      page: { page: 2, pageSize: 3, totalItems: 5, totalPages: 2 },
    });
    expect(fake.calls.map((call) => call.table)).toEqual([ttsJobs, ttsJobs]);
    expect(fake.calls[1]).toMatchObject({ limit: 3, offset: 3 });
    expect(fake.calls[1]?.orderBy).toEqual([
      desc(ttsJobs.createdAt),
      desc(ttsJobs.id),
    ]);
    expect(Object.keys(fake.calls[1]?.fields ?? {})).toEqual([
      'id',
      'status',
      'requestedBy',
      'pendingCount',
      'processingCount',
      'succeededCount',
      'failedCount',
      'createdAt',
      'startedAt',
      'finishedAt',
    ]);
  });
});

describe('DrizzleTtsOperationsQuery 재생·게시 readiness', () => {
  it('SUCCEEDED 항목과 READY media의 내부 storage projection을 조회한다', async () => {
    const fake = createDatabase([
      [
        {
          itemId: ids.item,
          itemStatus: 'SUCCEEDED',
          mediaStatus: 'READY',
          storageKey: 'private/tts/audio.wav',
        },
      ],
    ]);
    const query = new DrizzleTtsOperationsQuery(fake.database as never);

    await expect(query.findAudioItem(ids.item)).resolves.toEqual({
      itemId: ids.item,
      itemStatus: 'SUCCEEDED',
      mediaStatus: 'READY',
      storageKey: 'private/tts/audio.wav',
    });
  });

  it('필수 target을 최신 관련 item metadata로 blocker projection한다', async () => {
    const fake = createDatabase([
      [{ id: ids.version }],
      [
        {
          jobId: ids.job,
          itemId: ids.item,
          targetKind: 'THAI_SENTENCE_VERSION',
          targetId: ids.target,
          itemStatus: 'FAILED',
          attempt: 2,
          errorCode: 'TTS_PROVIDER_TIMEOUT',
          retryable: true,
        },
      ],
    ]);
    const readiness = {
      listRequiredTargets: vi.fn().mockResolvedValue([
        {
          kind: 'VOCABULARY_PRONUNCIATION',
          targetId: ids.media,
          mediaStatus: 'READY',
        },
        {
          kind: 'THAI_SENTENCE_VERSION',
          targetId: ids.target,
          mediaStatus: 'FAILED',
        },
      ]),
    };
    const query = new DrizzleTtsOperationsQuery(
      fake.database as never,
      readiness,
    );

    await expect(
      query.getPublicationReadiness({
        questionId: ids.job,
        versionId: ids.version,
      }),
    ).resolves.toEqual({
      ready: false,
      requiredCount: 2,
      readyCount: 1,
      blockers: [
        {
          kind: 'THAI_SENTENCE_VERSION',
          targetId: ids.target,
          mediaStatus: 'FAILED',
          operation: {
            jobId: ids.job,
            itemId: ids.item,
            itemStatus: 'FAILED',
            attempt: 2,
            errorCode: 'TTS_PROVIDER_TIMEOUT',
            retryable: true,
          },
        },
      ],
    });
  });
});

describe('DrizzleTtsOperationsQuery 작업 상세', () => {
  it('voice snapshot과 저장된 aggregate만 반환한다', async () => {
    const fake = createDatabase([[jobRow]]);
    const query = new DrizzleTtsOperationsQuery(fake.database as never);

    await expect(query.findJob(ids.job)).resolves.toEqual({
      id: ids.job,
      status: 'PARTIALLY_FAILED',
      requestedBy: ids.requester,
      counts: { pending: 1, processing: 2, succeeded: 3, failed: 4 },
      createdAt: jobRow.createdAt,
      startedAt: jobRow.startedAt,
      finishedAt: null,
      voice,
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.table).toBe(ttsJobs);
  });

  it('없는 작업은 null을 반환한다', async () => {
    const fake = createDatabase([[]]);
    const query = new DrizzleTtsOperationsQuery(fake.database as never);

    await expect(query.findJob(ids.job)).resolves.toBeNull();
  });
});

describe('DrizzleTtsOperationsQuery 작업 항목', () => {
  it('상태·오류 조건의 nullable media item page를 최신순으로 반환한다', async () => {
    const fake = createDatabase([[{ totalItems: 1 }], [itemRow]]);
    const query = new DrizzleTtsOperationsQuery(fake.database as never);

    await expect(
      query.listItems({
        jobId: ids.job,
        status: 'FAILED',
        errorCode: 'TTS_PROVIDER_TIMEOUT',
        page: 1,
        pageSize: 10,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: ids.item,
          target: {
            kind: 'THAI_SENTENCE_VERSION',
            targetId: itemRow.targetId,
            text: 'สวัสดี',
            required: true,
            revision: 'sentence-v1',
          },
          status: 'FAILED',
          attempt: 2,
          errorCode: 'TTS_PROVIDER_TIMEOUT',
          retryable: true,
          mediaAssetId: null,
        },
      ],
      page: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    expect(fake.calls.map((call) => call.table)).toEqual([ttsItems, ttsItems]);
    expect(fake.calls[1]).toMatchObject({ limit: 10, offset: 0 });
    expect(fake.calls[1]?.orderBy).toEqual([
      desc(ttsItems.createdAt),
      desc(ttsItems.id),
    ]);
    expect(Object.keys(fake.calls[1]?.fields ?? {})).toEqual([
      'id',
      'targetKind',
      'targetId',
      'targetText',
      'targetRequired',
      'revision',
      'status',
      'attempt',
      'errorCode',
      'retryable',
      'mediaAssetId',
    ]);
  });

  it('성공 항목은 media asset ID만 노출한다', async () => {
    const fake = createDatabase([
      [{ totalItems: 1 }],
      [
        {
          ...itemRow,
          status: 'SUCCEEDED',
          errorCode: null,
          retryable: false,
          mediaAssetId: ids.media,
        },
      ],
    ]);
    const query = new DrizzleTtsOperationsQuery(fake.database as never);

    await expect(
      query.listItems({ jobId: ids.job, page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [
        {
          id: ids.item,
          status: 'SUCCEEDED',
          errorCode: null,
          mediaAssetId: ids.media,
        },
      ],
      page: { totalItems: 1, totalPages: 1 },
    });
  });
});
