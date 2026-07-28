/** orphan TTS audio 삭제의 참조 확인 이후 side effect와 lease redelivery를 검증한다 */
/* eslint-disable @typescript-eslint/unbound-method -- Vitest는 interface-owned mock method 호출 여부를 직접 검증한다. */
import { describe, expect, it, vi } from 'vitest';
import type { TtsAudioGarbageStore } from '@flex-thia/domain';
import { S3TtsAudioStore } from '@flex-thia/providers';
import {
  TtsAudioGarbageCollector,
  type TtsAudioGcRepository,
} from './tts-audio-gc.js';

const now = new Date('2026-07-28T05:00:00.000Z');
const claimed = {
  id: '00000000-0000-4000-8000-000000000001',
  leaseOwner: 'worker-a:lease-1',
  media: {
    storageKey: 'private/tts/runs/00000000-0000-4000-8000-000000000001.wav',
    mimeType: 'audio/wav' as const,
    sizeBytes: 204,
    sha256: 'a'.repeat(64),
  },
};

const createRepository = (): TtsAudioGcRepository => ({
  claimAudioGcBatch: vi.fn(() => Promise.resolve([claimed])),
  acknowledgeAudioDeleted: vi.fn(() => Promise.resolve(true)),
  releaseAudioGc: vi.fn(() => Promise.resolve(true)),
});

const createStore = (): TtsAudioGarbageStore => ({
  inspect: vi
    .fn()
    .mockResolvedValueOnce(claimed.media)
    .mockResolvedValueOnce(null),
  delete: vi.fn(() => Promise.resolve()),
});

describe('TTS audio garbage collector', () => {
  it('검증 metadata가 같은 object만 삭제하고 부재를 확인한 뒤 terminal ack한다', async () => {
    const repository = createRepository();
    const store = createStore();
    const collector = new TtsAudioGarbageCollector(
      repository,
      store,
      () => now,
    );

    await expect(
      collector.processBatch({
        workerId: 'worker-a',
        batchSize: 10,
        leaseDurationMs: 60_000,
        retryDelayMs: 30_000,
      }),
    ).resolves.toEqual({ claimed: 1, deleted: 1, released: 0 });
    expect(store.delete).toHaveBeenCalledWith(claimed.media.storageKey);
    expect(repository.acknowledgeAudioDeleted).toHaveBeenCalledWith({
      id: claimed.id,
      leaseOwner: claimed.leaseOwner,
      deletedAt: now,
    });
  });

  it('이미 삭제된 object redelivery는 delete를 반복하지 않고 같은 lease를 terminal ack한다', async () => {
    const repository = createRepository();
    const store: TtsAudioGarbageStore = {
      inspect: vi.fn(() => Promise.resolve(null)),
      delete: vi.fn(() => Promise.resolve()),
    };

    await new TtsAudioGarbageCollector(
      repository,
      store,
      () => now,
    ).processBatch({
      workerId: 'worker-a',
      batchSize: 1,
      leaseDurationMs: 60_000,
      retryDelayMs: 30_000,
    });

    expect(store.delete).not.toHaveBeenCalled();
    expect(repository.acknowledgeAudioDeleted).toHaveBeenCalledOnce();
  });

  it('S3 HeadObject 404도 object 부재로 보고 같은 lease를 terminal ack한다', async () => {
    const repository = createRepository();
    const store = new S3TtsAudioStore(
      {
        send: vi.fn().mockRejectedValue({ $metadata: { httpStatusCode: 404 } }),
      } as never,
      'media-bucket',
    );

    await expect(
      new TtsAudioGarbageCollector(repository, store, () => now).processBatch({
        workerId: 'worker-a',
        batchSize: 1,
        leaseDurationMs: 60_000,
        retryDelayMs: 30_000,
      }),
    ).resolves.toEqual({ claimed: 1, deleted: 1, released: 0 });
    expect(repository.acknowledgeAudioDeleted).toHaveBeenCalledOnce();
    expect(repository.releaseAudioGc).not.toHaveBeenCalled();
  });

  it.each([
    ['MIME', { mimeType: 'audio/mpeg' as 'audio/wav' }],
    ['크기', { sizeBytes: claimed.media.sizeBytes + 1 }],
    ['해시', { sha256: 'b'.repeat(64) }],
  ])(
    '참조 확인된 run 고유 key의 %s metadata가 달라도 object를 삭제하고 terminal ack한다',
    async (_label, mismatch) => {
      const repository = createRepository();
      const actual = { ...claimed.media, ...mismatch };
      const store: TtsAudioGarbageStore = {
        inspect: vi
          .fn()
          .mockResolvedValueOnce(actual)
          .mockResolvedValueOnce(null),
        delete: vi.fn(() => Promise.resolve()),
      };

      await expect(
        new TtsAudioGarbageCollector(repository, store, () => now).processBatch(
          {
            workerId: 'worker-a',
            batchSize: 1,
            leaseDurationMs: 60_000,
            retryDelayMs: 30_000,
          },
        ),
      ).resolves.toEqual({ claimed: 1, deleted: 1, released: 0 });

      expect(store.delete).toHaveBeenCalledWith(claimed.media.storageKey);
      expect(repository.releaseAudioGc).not.toHaveBeenCalled();
      expect(repository.acknowledgeAudioDeleted).toHaveBeenCalledOnce();
    },
  );

  it('DB가 직접 참조를 발견해 claim을 주지 않으면 object를 삭제하지 않는다', async () => {
    const repository = createRepository();
    repository.claimAudioGcBatch = vi.fn(() => Promise.resolve([]));
    const store = createStore();

    await expect(
      new TtsAudioGarbageCollector(repository, store, () => now).processBatch({
        workerId: 'worker-a',
        batchSize: 1,
        leaseDurationMs: 60_000,
        retryDelayMs: 30_000,
      }),
    ).resolves.toEqual({ claimed: 0, deleted: 0, released: 0 });

    expect(store.inspect).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('delete 실패와 삭제 미확인은 ack하지 않고 lease를 backoff release한다', async () => {
    const firstRepository = createRepository();
    const failedStore: TtsAudioGarbageStore = {
      inspect: vi.fn(() => Promise.resolve(claimed.media)),
      delete: vi.fn(() => Promise.reject(new Error('secret'))),
    };
    await new TtsAudioGarbageCollector(
      firstRepository,
      failedStore,
      () => now,
    ).processBatch({
      workerId: 'worker-a',
      batchSize: 1,
      leaseDurationMs: 60_000,
      retryDelayMs: 30_000,
    });
    expect(firstRepository.acknowledgeAudioDeleted).not.toHaveBeenCalled();
    expect(firstRepository.releaseAudioGc).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'TTS_AUDIO_GC_DELETE_FAILED',
        nextAvailableAt: new Date('2026-07-28T05:00:30.000Z'),
      }),
    );

    const secondRepository = createRepository();
    const unconfirmedStore: TtsAudioGarbageStore = {
      inspect: vi.fn(() => Promise.resolve(claimed.media)),
      delete: vi.fn(() => Promise.resolve()),
    };
    await new TtsAudioGarbageCollector(
      secondRepository,
      unconfirmedStore,
      () => now,
    ).processBatch({
      workerId: 'worker-a',
      batchSize: 1,
      leaseDurationMs: 60_000,
      retryDelayMs: 30_000,
    });
    expect(secondRepository.releaseAudioGc).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'TTS_AUDIO_GC_DELETE_UNCONFIRMED',
      }),
    );
  });
});
