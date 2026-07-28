/** orphan TTS audio 삭제의 참조 확인 이후 side effect와 lease redelivery를 검증한다 */
/* eslint-disable @typescript-eslint/unbound-method -- Vitest는 interface-owned mock method 호출 여부를 직접 검증한다. */
import { describe, expect, it, vi } from 'vitest';
import type { TtsAudioGarbageStore } from '@flex-thia/domain';
import {
  TtsAudioGarbageCollector,
  type TtsAudioGcRepository,
} from './tts-audio-gc.js';

const now = new Date('2026-07-28T05:00:00.000Z');
const claimed = {
  id: '00000000-0000-4000-8000-000000000001',
  leaseOwner: 'worker-a:lease-1',
  media: {
    storageKey: 'private/tts/cache.wav',
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

  it('inspect metadata가 다르면 삭제하지 않고 bounded 오류로 release한다', async () => {
    const repository = createRepository();
    const store: TtsAudioGarbageStore = {
      inspect: vi.fn(() =>
        Promise.resolve({ ...claimed.media, sha256: 'b'.repeat(64) }),
      ),
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
    expect(repository.releaseAudioGc).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'TTS_AUDIO_GC_METADATA_MISMATCH',
      }),
    );
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
