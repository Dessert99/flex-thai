/** TTS 운영 HTTP 서비스의 조회 projection과 재시도 오류 변환을 검증한다 */
import { TtsDomainError } from '@flex-thia/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  TtsOperationsService,
  type TtsOperationsQueryPort,
  type TtsRetryCoordinator,
} from './tts-operations.service.js';

const ids = {
  job: '00000000-0000-4000-8000-000000000001',
  item: '00000000-0000-4000-8000-000000000002',
  requester: '00000000-0000-4000-8000-000000000003',
  target: '00000000-0000-4000-8000-000000000004',
  preset: '00000000-0000-4000-8000-000000000005',
  admin: '00000000-0000-4000-8000-000000000006',
  request: '00000000-0000-4000-8000-000000000007',
} as const;
const actor = { userId: ids.admin, sub: 'admin-sub', requestId: ids.request };

const job = {
  id: ids.job,
  status: 'PARTIALLY_FAILED' as const,
  requestedBy: ids.requester,
  counts: { pending: 0, processing: 0, succeeded: 1, failed: 1 },
  createdAt: new Date('2026-07-27T00:00:00.000Z'),
  startedAt: new Date('2026-07-27T00:01:00.000Z'),
  finishedAt: new Date('2026-07-27T00:02:00.000Z'),
};

const detail = {
  ...job,
  voice: {
    presetId: ids.preset,
    provider: 'local',
    model: 'deterministic-v1',
    voice: 'thai-female',
    locale: 'th-TH' as const,
    audioFormat: 'audio/wav' as const,
    generationRevision: '2026-07-27',
  },
};

const item = {
  id: ids.item,
  target: {
    kind: 'THAI_SENTENCE_VERSION' as const,
    targetId: ids.target,
    text: 'สวัสดี',
    required: true,
    revision: 'sentence-v1',
  },
  status: 'FAILED' as const,
  attempt: 2,
  errorCode: 'TTS_PROVIDER_TIMEOUT',
  retryable: true,
  mediaAssetId: null,
};

const createService = (overrides?: {
  findJob?: TtsOperationsQueryPort['findJob'];
  retryAndDispatch?: TtsRetryCoordinator['retryAndDispatch'];
}) => {
  const query = {
    listJobs: vi.fn().mockResolvedValue({
      items: [{ ...job, storageKey: 'private/job' }],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }),
    findJob: overrides?.findJob ?? vi.fn().mockResolvedValue(detail),
    listItems: vi.fn().mockResolvedValue({
      items: [
        {
          ...item,
          storageKey: 'private/audio.wav',
          bytes: new Uint8Array([1, 2, 3]),
          providerRaw: { secret: true },
        },
      ],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }),
  };
  const retryCoordinator = {
    retryAndDispatch:
      overrides?.retryAndDispatch ?? vi.fn().mockResolvedValue(1),
  };
  return {
    query,
    retryCoordinator,
    service: new TtsOperationsService({
      query,
      retryCoordinator,
      now: () => new Date('2026-07-27T03:00:00.000Z'),
    }),
  };
};

describe('TtsOperationsService 조회', () => {
  it('기간 문자열을 Date로 바꾸고 허용된 작업 목록 필드만 반환한다', async () => {
    const { query, service } = createService();

    const result = await service.listJobs({
      status: 'PARTIALLY_FAILED',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
      page: 1,
      pageSize: 20,
    });

    expect(query.listJobs).toHaveBeenCalledWith({
      status: 'PARTIALLY_FAILED',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-31T23:59:59.999Z'),
      page: 1,
      pageSize: 20,
    });
    expect(result.items[0]).toEqual({
      ...job,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt.toISOString(),
      finishedAt: job.finishedAt.toISOString(),
    });
    expect(JSON.stringify(result)).not.toContain('storageKey');
  });

  it('상세와 항목을 조회하며 storage·bytes·provider 원문을 노출하지 않는다', async () => {
    const { query, service } = createService();

    const result = await service.getJob(ids.job, {
      status: 'FAILED',
      errorCode: 'TTS_PROVIDER_TIMEOUT',
      page: 1,
      pageSize: 20,
    });

    expect(query.listItems).toHaveBeenCalledWith({
      jobId: ids.job,
      status: 'FAILED',
      errorCode: 'TTS_PROVIDER_TIMEOUT',
      page: 1,
      pageSize: 20,
    });
    expect(result.items).toEqual([item]);
    expect(JSON.stringify(result)).not.toContain('storageKey');
    expect(JSON.stringify(result)).not.toContain('bytes');
    expect(JSON.stringify(result)).not.toContain('providerRaw');
  });

  it('없는 작업을 stable 404 오류로 변환한다', async () => {
    const { service } = createService({
      findJob: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.getJob(ids.job, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'TTS_JOB_NOT_FOUND' },
    });
  });
});

describe('TtsOperationsService 재시도', () => {
  it('일괄 재시도를 attempt map과 고정 시각의 durable coordinator에 맡긴다', async () => {
    const { retryCoordinator, service } = createService();

    await expect(
      service.retryJob(actor, ids.job, [
        { itemId: ids.item, expectedAttempt: 2 },
      ]),
    ).resolves.toEqual({
      jobId: ids.job,
      itemIds: [ids.item],
      retriedCount: 1,
    });
    expect(retryCoordinator.retryAndDispatch).toHaveBeenCalledOnce();
    expect(retryCoordinator.retryAndDispatch).toHaveBeenCalledWith({
      jobId: ids.job,
      itemIds: [ids.item],
      expectedAttempts: { [ids.item]: 2 },
      requestedAt: new Date('2026-07-27T03:00:00.000Z'),
      context: {
        actorSub: 'admin-sub',
        actorUserId: ids.admin,
        requestId: ids.request,
      },
    });
  });

  it('개별 재시도를 같은 durable coordinator 의미로 연결한다', async () => {
    const { retryCoordinator, service } = createService();

    await expect(
      service.retryItem(actor, ids.item, {
        jobId: ids.job,
        expectedAttempt: 2,
      }),
    ).resolves.toEqual({
      jobId: ids.job,
      itemIds: [ids.item],
      retriedCount: 1,
    });
    expect(retryCoordinator.retryAndDispatch).toHaveBeenCalledOnce();
    expect(retryCoordinator.retryAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: ids.job,
        itemIds: [ids.item],
        expectedAttempts: { [ids.item]: 2 },
      }),
    );
  });

  it.each([['TTS_ITEM_NOT_RETRYABLE'], ['TTS_ITEM_STALE_ATTEMPT']] as const)(
    '%s 오류를 stable 409로 변환한다',
    async (code) => {
      const { service } = createService({
        retryAndDispatch: vi.fn().mockRejectedValue(new TtsDomainError(code)),
      });

      await expect(
        service.retryItem(actor, ids.item, {
          jobId: ids.job,
          expectedAttempt: 2,
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code },
      });
    },
  );

  it('없는 항목을 stable 404 오류로 변환한다', async () => {
    const { service } = createService({
      retryAndDispatch: vi
        .fn()
        .mockRejectedValue(new TtsDomainError('TTS_ITEM_NOT_FOUND')),
    });

    await expect(
      service.retryItem(actor, ids.item, {
        jobId: ids.job,
        expectedAttempt: 2,
      }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'TTS_ITEM_NOT_FOUND' },
    });
  });

  it('durable dispatch 실패를 성공 접수로 바꾸지 않고 그대로 전파한다', async () => {
    const dispatchFailure = new Error('TTS_RETRY_DISPATCH_FAILED');
    const retryAndDispatch = vi.fn().mockRejectedValue(dispatchFailure);
    const { service } = createService({ retryAndDispatch });

    await expect(
      service.retryJob(actor, ids.job, [
        { itemId: ids.item, expectedAttempt: 2 },
      ]),
    ).rejects.toBe(dispatchFailure);
    expect(retryAndDispatch).toHaveBeenCalledOnce();
  });
});
