/** TTS processor의 재사용·동시성·부분 실패와 안전한 공급자 실패를 검증한다 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method -- Vitest asymmetric matchers and interface-owned mock methods are any-typed. */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type {
  TtsAudioStore,
  TtsProvider,
  TtsProviderResult,
  TtsWorkItem,
} from '@flex-thia/domain';
import {
  TtsProcessor,
  UnavailableTtsProvider,
  type TtsProcessorRepository,
} from './tts-processor.js';

const now = new Date('2026-07-27T05:00:00.000Z');
const jobId = '00000000-0000-4000-8000-000000000001';
const mediaAssetId = '00000000-0000-4000-8000-000000000099';

const voice = {
  presetId: '00000000-0000-4000-8000-000000000005',
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  voice: 'thai-female',
  locale: 'th-TH' as const,
  audioFormat: 'audio/wav' as const,
  generationRevision: 'v1',
};

const workItem = (
  itemId: string,
  cacheKey = `cache-${itemId}`,
  text = 'สวัสดี',
): TtsWorkItem => ({
  jobId,
  itemId,
  attempt: 0,
  leaseToken: `lease-${itemId}`,
  leaseUntil: new Date('2026-07-27T05:05:00.000Z'),
  target: {
    kind: 'THAI_SENTENCE_VERSION',
    targetId: `target-${itemId}`,
    text,
    required: true,
    revision: 'revision-1',
  },
  voice,
  cacheKey,
});

class MemoryTtsRepository implements TtsProcessorRepository {
  readonly succeeded: Parameters<TtsProcessorRepository['succeed']>[0][] = [];
  readonly failed: Parameters<TtsProcessorRepository['fail']>[0][] = [];
  readonly attachments: Array<{ itemId: string; mediaAssetId: string }> = [];
  readonly readyByCacheKey = new Map<string, string>();
  readonly generating = new Set<string>();
  readonly pendingAudio = new Set<string>();
  readonly failedByCacheKey = new Map<
    string,
    { errorCode: string; retryable: boolean }
  >();
  readonly staleGenerating = new Set<string>();
  readonly outcomeUnknown = new Set<string>();
  readonly processing = new Set<string>();
  readonly finalizedClaims: Array<{
    cacheKey: string;
    resolution: 'FAILED' | 'OUTCOME_UNKNOWN';
    errorCode?: string;
    retryable?: boolean;
  }> = [];
  readonly completionByItemId = new Map<
    string,
    'STALE_LEASE' | 'STALE_CACHE_CLAIM' | 'STALE_TARGET' | 'MEDIA_CONFLICT'
  >();
  waitClaims = 0;
  claimAudioError: Error | null = null;
  afterClaim: (() => void) | null = null;
  private failedCount = 0;

  constructor(private readonly pending: TtsWorkItem[]) {}

  enqueue(item: TtsWorkItem): void {
    this.pending.push(item);
  }

  reopenRetryableCache(cacheKey: string): boolean {
    const failure = this.failedByCacheKey.get(cacheKey);
    if (!failure?.retryable) return false;
    this.failedByCacheKey.delete(cacheKey);
    this.pendingAudio.add(cacheKey);
    return true;
  }

  claimNext(): Promise<TtsWorkItem | null> {
    const item = this.pending.shift() ?? null;
    if (item) this.processing.add(item.itemId);
    this.afterClaim?.();
    return Promise.resolve(item);
  }

  claimAudio(
    cacheKey: string,
  ): ReturnType<TtsProcessorRepository['claimAudio']> {
    if (this.claimAudioError) return Promise.reject(this.claimAudioError);
    const ready = this.readyByCacheKey.get(cacheKey);
    if (ready) return Promise.resolve({ kind: 'REUSE', mediaAssetId: ready });
    if (this.outcomeUnknown.has(cacheKey)) {
      return Promise.resolve({ kind: 'OUTCOME_UNKNOWN' });
    }
    const failed = this.failedByCacheKey.get(cacheKey);
    if (failed) return Promise.resolve({ kind: 'FAILED', ...failed });
    if (this.generating.has(cacheKey)) {
      if (this.staleGenerating.has(cacheKey)) {
        this.generating.delete(cacheKey);
        this.outcomeUnknown.add(cacheKey);
        return Promise.resolve({ kind: 'OUTCOME_UNKNOWN' });
      }
      this.waitClaims += 1;
      return Promise.resolve({ kind: 'WAIT' });
    }
    this.pendingAudio.delete(cacheKey);
    this.generating.add(cacheKey);
    return Promise.resolve({
      kind: 'GENERATE',
      claimToken: `claim-${cacheKey}`,
    });
  }

  succeed(
    input: Parameters<TtsProcessorRepository['succeed']>[0],
  ): ReturnType<TtsProcessorRepository['succeed']> {
    this.succeeded.push(input);
    const rejected = this.completionByItemId.get(input.item.itemId);
    if (rejected) return Promise.resolve({ kind: rejected });

    const attachedMediaAssetId =
      input.kind === 'REUSED'
        ? input.mediaAssetId
        : `media-${input.media.sha256.slice(0, 12)}`;
    if (input.kind === 'GENERATED') {
      this.readyByCacheKey.set(input.item.cacheKey, attachedMediaAssetId);
      this.generating.delete(input.item.cacheKey);
      this.failedByCacheKey.delete(input.item.cacheKey);
    }
    this.attachments.push({
      itemId: input.item.itemId,
      mediaAssetId: attachedMediaAssetId,
    });
    this.processing.delete(input.item.itemId);
    return Promise.resolve({
      kind: 'COMPLETED',
      mediaAssetId: attachedMediaAssetId,
    });
  }

  fail(
    input: Parameters<TtsProcessorRepository['fail']>[0],
  ): ReturnType<TtsProcessorRepository['fail']> {
    this.failed.push(input);
    if (input.audioClaim) {
      if (!this.generating.has(input.item.cacheKey)) {
        return Promise.resolve({ kind: 'STALE_CACHE_CLAIM' });
      }
      this.generating.delete(input.item.cacheKey);
      if (input.audioClaim.resolution === 'OUTCOME_UNKNOWN') {
        this.outcomeUnknown.add(input.item.cacheKey);
      } else {
        this.failedByCacheKey.set(input.item.cacheKey, {
          errorCode: input.audioClaim.errorCode,
          retryable: input.audioClaim.retryable,
        });
      }
    }
    if (this.completionByItemId.get(input.item.itemId) === 'STALE_LEASE') {
      return Promise.resolve({ kind: 'STALE_LEASE' });
    }
    this.processing.delete(input.item.itemId);
    this.failedCount += 1;
    return Promise.resolve({ kind: 'FAILED' });
  }

  finalizeAudioClaim(
    cacheKey: string,
    audioClaim: {
      claimToken: string;
      resolution: 'FAILED' | 'OUTCOME_UNKNOWN';
      errorCode?: string;
      retryable?: boolean;
    },
  ): ReturnType<TtsProcessorRepository['finalizeAudioClaim']> {
    if (!this.generating.has(cacheKey)) {
      return Promise.resolve('STALE_CACHE_CLAIM');
    }
    this.generating.delete(cacheKey);
    if (audioClaim.resolution === 'OUTCOME_UNKNOWN') {
      this.outcomeUnknown.add(cacheKey);
    } else {
      this.failedByCacheKey.set(cacheKey, {
        errorCode: audioClaim.errorCode ?? 'TTS_CACHE_FAILED',
        retryable: audioClaim.retryable ?? false,
      });
    }
    this.finalizedClaims.push({
      cacheKey,
      resolution: audioClaim.resolution,
      ...('errorCode' in audioClaim
        ? {
            errorCode: audioClaim.errorCode,
            retryable: audioClaim.retryable,
          }
        : {}),
    });
    return Promise.resolve('FINALIZED');
  }

  getJobStatus(): ReturnType<TtsProcessorRepository['getJobStatus']> {
    if (this.processing.size > 0) return Promise.resolve('RUNNING');
    if (this.pending.length > 0) return Promise.resolve('QUEUED');
    if (this.failedCount === 0) return Promise.resolve('SUCCEEDED');
    if (this.attachments.length === 0) return Promise.resolve('FAILED');
    return Promise.resolve('PARTIALLY_FAILED');
  }
}

const providerResult = (
  bytes = new Uint8Array([82, 73, 70, 70]),
): TtsProviderResult => ({
  bytes,
  mimeType: 'audio/wav',
  usage: { inputCharacters: 7 },
  estimatedCostUsd: '0.000000',
  providerRequestId: 'provider-request',
});

const createProvider = (
  synthesize: TtsProvider['synthesize'] = () =>
    Promise.resolve(providerResult()),
): TtsProvider => ({ synthesize: vi.fn(synthesize) });

const createStore = (): TtsAudioStore => ({
  put: vi.fn(({ cacheKey, bytes, mimeType, sha256 }) =>
    Promise.resolve({
      storageKey: `private/tts/${cacheKey}.wav`,
      mimeType,
      sizeBytes: bytes.byteLength,
      sha256,
    }),
  ),
});

describe('TtsProcessor 음성 생성과 재사용', () => {
  it('READY cache는 provider와 store를 호출하지 않고 기존 media를 연결한다', async () => {
    const item = workItem('item-1');
    const repository = new MemoryTtsRepository([item]);
    repository.readyByCacheKey.set(item.cacheKey, mediaAssetId);
    const provider = createProvider();
    const store = createStore();

    const status = await new TtsProcessor(
      repository,
      provider,
      store,
      () => now,
    ).process(jobId, new AbortController().signal);

    expect(status).toBe('SUCCEEDED');
    expect(provider.synthesize).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
    expect(repository.succeeded).toEqual([
      expect.objectContaining({
        kind: 'REUSED',
        mediaAssetId,
        item,
      }),
    ]);
  });

  it('cache miss는 provider와 immutable store를 한 번 호출한 뒤 저장 metadata를 원자 완료에 넘긴다', async () => {
    const item = workItem('item-1');
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const repository = new MemoryTtsRepository([item]);
    const provider = createProvider(() =>
      Promise.resolve(providerResult(bytes)),
    );
    const store = createStore();

    await new TtsProcessor(repository, provider, store, () => now).process(
      jobId,
      new AbortController().signal,
    );

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(provider.synthesize).toHaveBeenCalledOnce();
    expect(store.put).toHaveBeenCalledWith({
      cacheKey: item.cacheKey,
      bytes,
      mimeType: 'audio/wav',
      sha256,
    });
    expect(repository.succeeded).toEqual([
      {
        kind: 'GENERATED',
        item,
        claimToken: `claim-${item.cacheKey}`,
        media: {
          storageKey: `private/tts/${item.cacheKey}.wav`,
          mimeType: 'audio/wav',
          sizeBytes: bytes.byteLength,
          sha256,
        },
        completedAt: now,
      },
    ]);
    expect(repository.succeeded[0]).not.toHaveProperty('mediaAssetId');
  });

  it('서로 다른 processor의 같은 key 동시 처리는 DB를 재확인해 provider 한 번과 media 연결 두 건만 남긴다', async () => {
    const repository = new MemoryTtsRepository([
      workItem('item-1', 'same-key'),
      workItem('item-2', 'same-key'),
    ]);
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const provider = createProvider(async () => {
      await providerGate;
      return providerResult();
    });
    const firstProcessor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    );
    const secondProcessor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    );
    const first = firstProcessor.process(jobId, new AbortController().signal);
    await vi.waitFor(() => expect(provider.synthesize).toHaveBeenCalledOnce());
    const second = secondProcessor.process(jobId, new AbortController().signal);
    await vi.waitFor(() => expect(repository.waitClaims).toBeGreaterThan(0));

    releaseProvider();
    await expect(Promise.all([first, second])).resolves.toEqual([
      'RUNNING',
      'SUCCEEDED',
    ]);
    expect(provider.synthesize).toHaveBeenCalledOnce();
    expect(repository.attachments).toHaveLength(2);
    expect(
      new Set(repository.attachments.map((entry) => entry.mediaAssetId)),
    ).toEqual(new Set([repository.attachments[0]!.mediaAssetId]));
    expect(repository.succeeded.map((input) => input.kind).sort()).toEqual([
      'GENERATED',
      'REUSED',
    ]);
  });

  it('외부 생성 결과가 불명확한 cache claim은 다시 합성하지 않고 terminal 실패시킨다', async () => {
    const item = workItem('item-1');
    const repository = new MemoryTtsRepository([item]);
    repository.outcomeUnknown.add(item.cacheKey);
    const provider = createProvider();

    await expect(
      new TtsProcessor(repository, provider, createStore(), () => now).process(
        jobId,
        new AbortController().signal,
      ),
    ).resolves.toBe('FAILED');
    expect(provider.synthesize).not.toHaveBeenCalled();
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_PROVIDER_OUTCOME_UNKNOWN',
        retryable: false,
      }),
    ]);
  });

  it('claim할 항목이 없어도 다른 worker가 처리 중이면 canonical RUNNING을 반환한다', async () => {
    const repository = new MemoryTtsRepository([]);
    repository.processing.add('other-worker-item');

    await expect(
      new TtsProcessor(
        repository,
        createProvider(),
        createStore(),
        () => now,
      ).process(jobId, new AbortController().signal),
    ).resolves.toBe('RUNNING');
  });

  it('GENERATING 대기는 item lease까지만 DB를 재확인하고 provider를 호출하지 않는다', async () => {
    const item = workItem('lease-bound', 'external-key');
    const repository = new MemoryTtsRepository([item]);
    repository.generating.add(item.cacheKey);
    let clock = new Date(now);
    const provider = createProvider();
    const processor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => clock,
      () => {
        clock = new Date(item.leaseUntil);
        return Promise.resolve();
      },
    );

    await expect(
      processor.process(jobId, new AbortController().signal),
    ).resolves.toBe('RUNNING');
    expect(repository.waitClaims).toBe(1);
    expect(provider.synthesize).not.toHaveBeenCalled();
    expect(repository.failed).toEqual([]);
  });

  it('item lease 만료 뒤 reclaim되어도 stale cache claim은 OUTCOME_UNKNOWN으로 끝나 무한 WAIT하지 않는다', async () => {
    const first = workItem('reclaimed', 'stale-cache-key');
    const repository = new MemoryTtsRepository([first]);
    repository.generating.add(first.cacheKey);
    let clock = new Date(now);
    const provider = createProvider();
    const processor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => clock,
      () => {
        clock = new Date(first.leaseUntil);
        return Promise.resolve();
      },
    );

    await expect(
      processor.process(jobId, new AbortController().signal),
    ).resolves.toBe('RUNNING');

    repository.enqueue({
      ...first,
      leaseToken: 'reclaimed-lease',
      leaseUntil: new Date(first.leaseUntil.getTime() + 5 * 60 * 1000),
    });
    repository.staleGenerating.add(first.cacheKey);
    await expect(
      processor.process(jobId, new AbortController().signal),
    ).resolves.toBe('FAILED');
    expect(repository.outcomeUnknown.has(first.cacheKey)).toBe(true);
    expect(provider.synthesize).not.toHaveBeenCalled();
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_PROVIDER_OUTCOME_UNKNOWN',
        retryable: false,
      }),
    ]);
  });

  it('GENERATING 대기 중 signal abort는 다른 worker의 claim을 건드리지 않고 현재 item만 실패시킨다', async () => {
    const controller = new AbortController();
    const item = workItem('wait-abort', 'external-key');
    const repository = new MemoryTtsRepository([item]);
    repository.generating.add(item.cacheKey);
    const provider = createProvider();
    const processor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
      () => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      },
    );

    await expect(processor.process(jobId, controller.signal)).resolves.toBe(
      'FAILED',
    );
    expect(provider.synthesize).not.toHaveBeenCalled();
    expect(repository.generating.has(item.cacheKey)).toBe(true);
    expect(repository.failed).toEqual([
      expect.objectContaining({ errorCode: 'TTS_PROCESS_ABORTED' }),
    ]);
  });

  it('cache claim DB 실패는 abort로 위장하지 않고 안정적인 retryable 실패를 남긴다', async () => {
    const repository = new MemoryTtsRepository([workItem('db-failure')]);
    repository.claimAudioError = new Error('database unavailable');

    await expect(
      new TtsProcessor(
        repository,
        createProvider(),
        createStore(),
        () => now,
      ).process(jobId, new AbortController().signal),
    ).resolves.toBe('FAILED');
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_CACHE_CLAIM_FAILED',
        retryable: true,
      }),
    ]);
  });
});

describe('TtsProcessor 실패 격리', () => {
  it.each([
    ['TTS_PROVIDER_TIMEOUT', true],
    ['TTS_PROVIDER_RETRYABLE', true],
    ['TTS_PROVIDER_TERMINAL', false],
  ] as const)(
    '%s 공급자 오류의 retryable 분류를 보존한다',
    async (errorCode, retryable) => {
      const repository = new MemoryTtsRepository([workItem('item-1')]);
      const provider = createProvider(() =>
        Promise.reject(
          Object.assign(new Error(errorCode), { code: errorCode, retryable }),
        ),
      );

      await new TtsProcessor(
        repository,
        provider,
        createStore(),
        () => now,
      ).process(jobId, new AbortController().signal);

      expect(repository.failed).toEqual([
        expect.objectContaining({ errorCode, retryable }),
      ]);
    },
  );

  it('stale target 완료는 실패로 기록하고 다음 항목 처리를 계속한다', async () => {
    const stale = workItem('stale');
    const next = workItem('next');
    const repository = new MemoryTtsRepository([stale, next]);
    repository.completionByItemId.set(stale.itemId, 'STALE_TARGET');
    const provider = createProvider();

    const status = await new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    ).process(jobId, new AbortController().signal);

    expect(status).toBe('PARTIALLY_FAILED');
    expect(repository.failed).toEqual([
      expect.objectContaining({
        item: stale,
        errorCode: 'TTS_TARGET_STALE',
        retryable: false,
        audioClaim: expect.objectContaining({
          resolution: 'FAILED',
          errorCode: 'TTS_TARGET_STALE',
          retryable: false,
        }),
      }),
    ]);
    expect(repository.attachments).toEqual([
      expect.objectContaining({ itemId: next.itemId }),
    ]);
  });

  it('완료 시 cache claim이 stale이면 현재 item만 정확한 retryable 실패로 남긴다', async () => {
    const item = workItem('stale-cache');
    const repository = new MemoryTtsRepository([item]);
    repository.completionByItemId.set(item.itemId, 'STALE_CACHE_CLAIM');

    await expect(
      new TtsProcessor(
        repository,
        createProvider(),
        createStore(),
        () => now,
      ).process(jobId, new AbortController().signal),
    ).resolves.toBe('FAILED');
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_CACHE_CLAIM_STALE',
        retryable: true,
      }),
    ]);
    expect(repository.failed[0]).not.toHaveProperty('audioClaim');
  });

  it('완료 시 item lease가 stale이면 item을 덮지 않고 자신의 cache claim을 retryable 실패로 고정한다', async () => {
    const item = workItem('stale-lease');
    const repository = new MemoryTtsRepository([item]);
    repository.completionByItemId.set(item.itemId, 'STALE_LEASE');

    await expect(
      new TtsProcessor(
        repository,
        createProvider(),
        createStore(),
        () => now,
      ).process(jobId, new AbortController().signal),
    ).resolves.toBe('RUNNING');
    expect(repository.failed).toEqual([]);
    expect(repository.finalizedClaims).toEqual([
      {
        cacheKey: item.cacheKey,
        resolution: 'FAILED',
        errorCode: 'TTS_ITEM_STALE_LEASE',
        retryable: true,
      },
    ]);
  });

  it('한 item의 terminal 실패 뒤에도 다음 item을 처리해 부분 실패를 반환한다', async () => {
    const failed = workItem('failed', undefined, '[[terminal]]');
    const next = workItem('next');
    const repository = new MemoryTtsRepository([failed, next]);
    const provider = createProvider(({ text }) =>
      text.includes('[[terminal]]')
        ? Promise.reject(
            Object.assign(new Error('terminal'), {
              code: 'TTS_PROVIDER_TERMINAL',
              retryable: false,
            }),
          )
        : Promise.resolve(providerResult()),
    );

    await expect(
      new TtsProcessor(repository, provider, createStore(), () => now).process(
        jobId,
        new AbortController().signal,
      ),
    ).resolves.toBe('PARTIALLY_FAILED');
    expect(provider.synthesize).toHaveBeenCalledTimes(2);
    expect(repository.attachments).toEqual([
      expect.objectContaining({ itemId: next.itemId }),
    ]);
  });

  it('provider 처리 중 abort는 불명확 결과를 고정하고 새 item을 claim하지 않는다', async () => {
    const controller = new AbortController();
    const repository = new MemoryTtsRepository([
      workItem('aborted'),
      workItem('unclaimed'),
    ]);
    const provider = createProvider(({ signal }) => {
      controller.abort(new Error('stop'));
      return Promise.reject(
        signal.reason instanceof Error ? signal.reason : new Error('stop'),
      );
    });

    await expect(
      new TtsProcessor(repository, provider, createStore(), () => now).process(
        jobId,
        controller.signal,
      ),
    ).resolves.toBe('QUEUED');
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_PROVIDER_OUTCOME_UNKNOWN',
        retryable: false,
        audioClaim: expect.objectContaining({
          resolution: 'OUTCOME_UNKNOWN',
        }),
      }),
    ]);
    expect(provider.synthesize).toHaveBeenCalledOnce();
  });

  it('같은 key의 known provider 실패는 provider 한 번으로 cache와 모든 item에 재사용된다', async () => {
    const first = workItem('first', 'retry-key');
    const second = workItem('second', 'retry-key');
    const repository = new MemoryTtsRepository([first, second]);
    let rejectProvider!: (error: Error) => void;
    const providerGate = new Promise<TtsProviderResult>((_resolve, reject) => {
      rejectProvider = reject;
    });
    const provider = createProvider(() => providerGate);
    const firstProcessor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    );
    const secondProcessor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    );

    const firstRun = firstProcessor.process(
      jobId,
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(provider.synthesize).toHaveBeenCalledOnce());
    const secondRun = secondProcessor.process(
      jobId,
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(repository.waitClaims).toBeGreaterThan(0));
    rejectProvider(
      Object.assign(new Error('retryable'), {
        code: 'TTS_PROVIDER_RETRYABLE',
        retryable: true,
      }),
    );

    await expect(Promise.all([firstRun, secondRun])).resolves.toEqual([
      'RUNNING',
      'FAILED',
    ]);
    expect(provider.synthesize).toHaveBeenCalledOnce();
    expect(repository.failed).toHaveLength(2);
    expect(repository.failed[0]).toEqual(
      expect.objectContaining({
        audioClaim: {
          claimToken: `claim-${first.cacheKey}`,
          resolution: 'FAILED',
          errorCode: 'TTS_PROVIDER_RETRYABLE',
          retryable: true,
        },
      }),
    );
    expect(repository.failed[1]).toEqual(
      expect.objectContaining({
        item: second,
        errorCode: 'TTS_PROVIDER_RETRYABLE',
        retryable: true,
      }),
    );
    expect(repository.failed[1]).not.toHaveProperty('audioClaim');
  });

  it('later item은 FAILED cache를 재사용하고 명시적 retry만 한 번 다시 합성한다', async () => {
    const first = workItem('first', 'retry-key');
    const later = workItem('later', 'retry-key');
    const retried = { ...first, attempt: 1, leaseToken: 'lease-retried' };
    const repository = new MemoryTtsRepository([first]);
    let calls = 0;
    const provider = createProvider(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(
            Object.assign(new Error('retryable'), {
              code: 'TTS_PROVIDER_RETRYABLE',
              retryable: true,
            }),
          )
        : Promise.resolve(providerResult());
    });
    const processor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    );

    await processor.process(jobId, new AbortController().signal);
    repository.enqueue(later);
    await processor.process(jobId, new AbortController().signal);
    expect(provider.synthesize).toHaveBeenCalledOnce();

    expect(repository.reopenRetryableCache(first.cacheKey)).toBe(true);
    repository.enqueue(retried);
    await processor.process(jobId, new AbortController().signal);
    expect(provider.synthesize).toHaveBeenCalledTimes(2);
    expect(repository.attachments).toEqual([
      expect.objectContaining({ itemId: retried.itemId }),
    ]);
  });

  it('terminal FAILED cache는 명시적 retry로도 다시 열리지 않는다', async () => {
    const item = workItem('terminal', 'terminal-key');
    const repository = new MemoryTtsRepository([item]);
    const provider = createProvider(() =>
      Promise.reject(
        Object.assign(new Error('terminal'), {
          code: 'TTS_PROVIDER_TERMINAL',
          retryable: false,
        }),
      ),
    );
    const processor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    );

    await processor.process(jobId, new AbortController().signal);
    expect(repository.reopenRetryableCache(item.cacheKey)).toBe(false);
    repository.enqueue(workItem('later', item.cacheKey));
    await processor.process(jobId, new AbortController().signal);
    expect(provider.synthesize).toHaveBeenCalledOnce();
  });

  it('빈 audio와 store 실패는 stable cache 실패로 남아 후속 item의 재합성을 막는다', async () => {
    const empty = workItem('empty', 'empty-key', 'empty');
    const storeFailed = workItem('store-failed', 'store-key', 'store');
    const repository = new MemoryTtsRepository([empty, storeFailed]);
    const provider = createProvider(({ text }) =>
      Promise.resolve(
        text === empty.target.text
          ? providerResult(new Uint8Array())
          : providerResult(),
      ),
    );
    const store: TtsAudioStore = {
      put: vi.fn(({ cacheKey, bytes, mimeType, sha256 }) =>
        cacheKey === storeFailed.cacheKey
          ? Promise.reject(new Error('store failed'))
          : Promise.resolve({
              storageKey: `private/${cacheKey}.wav`,
              mimeType,
              sizeBytes: bytes.byteLength,
              sha256,
            }),
      ),
    };

    await expect(
      new TtsProcessor(repository, provider, store, () => now).process(
        jobId,
        new AbortController().signal,
      ),
    ).resolves.toBe('FAILED');
    expect(repository.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          errorCode: 'TTS_PROVIDER_EMPTY_AUDIO',
          audioClaim: expect.objectContaining({ resolution: 'FAILED' }),
        }),
        expect.objectContaining({
          errorCode: 'TTS_AUDIO_STORE_FAILED',
          audioClaim: expect.objectContaining({ resolution: 'FAILED' }),
        }),
      ]),
    );
    expect(repository.generating.size).toBe(0);
    expect(repository.failedByCacheKey.size).toBe(2);
  });

  it('store가 보고한 실제 object metadata가 bytes와 다르면 READY를 만들지 않는다', async () => {
    const item = workItem('corrupt-store', 'corrupt-key');
    const repository = new MemoryTtsRepository([item]);
    const store: TtsAudioStore = {
      put: vi.fn(({ cacheKey, bytes, mimeType }) =>
        Promise.resolve({
          storageKey: `private/tts/${cacheKey}.wav`,
          mimeType,
          sizeBytes: bytes.byteLength + 1,
          sha256: '0'.repeat(64),
        }),
      ),
    };

    await expect(
      new TtsProcessor(
        repository,
        createProvider(),
        store,
        () => now,
      ).process(jobId, new AbortController().signal),
    ).resolves.toBe('FAILED');
    expect(repository.succeeded).toEqual([]);
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_AUDIO_STORE_METADATA_MISMATCH',
        retryable: true,
        audioClaim: expect.objectContaining({
          resolution: 'FAILED',
          errorCode: 'TTS_AUDIO_STORE_METADATA_MISMATCH',
          retryable: true,
        }),
      }),
    ]);
  });

  it('provider가 명시한 불명확 결과만 OUTCOME_UNKNOWN으로 고정해 재합성을 금지한다', async () => {
    const item = workItem('unknown-provider', 'unknown-provider-key');
    const repository = new MemoryTtsRepository([item]);
    const provider = createProvider(() =>
      Promise.reject(
        Object.assign(new Error('unknown'), {
          code: 'TTS_PROVIDER_TIMEOUT',
          retryable: false,
          outcomeUnknown: true,
        }),
      ),
    );

    await expect(
      new TtsProcessor(repository, provider, createStore(), () => now).process(
        jobId,
        new AbortController().signal,
      ),
    ).resolves.toBe('FAILED');
    expect(repository.outcomeUnknown.has(item.cacheKey)).toBe(true);
    expect(repository.failed).toEqual([
      expect.objectContaining({
        audioClaim: expect.objectContaining({
          resolution: 'OUTCOME_UNKNOWN',
        }),
      }),
    ]);
    repository.enqueue(workItem('unknown-retry', item.cacheKey));
    await new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    ).process(jobId, new AbortController().signal);
    expect(provider.synthesize).toHaveBeenCalledOnce();
  });

  it('provider가 abort를 무시하고 결과를 반환해도 store 전에 cache 실패와 현재 item만 남긴다', async () => {
    const controller = new AbortController();
    const item = workItem('abort-after-provider');
    const repository = new MemoryTtsRepository([item]);
    const store = createStore();
    let resolveProvider!: (result: TtsProviderResult) => void;
    const providerResultPromise = new Promise<TtsProviderResult>((resolve) => {
      resolveProvider = resolve;
    });
    const processing = new TtsProcessor(
      repository,
      createProvider(() => providerResultPromise),
      store,
      () => now,
    ).process(jobId, controller.signal);
    await vi.waitFor(() =>
      expect(repository.generating.has(item.cacheKey)).toBe(true),
    );

    controller.abort();
    resolveProvider(providerResult());

    await expect(processing).resolves.toBe('FAILED');
    expect(store.put).not.toHaveBeenCalled();
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_PROCESS_ABORTED',
        audioClaim: expect.objectContaining({ resolution: 'FAILED' }),
      }),
    ]);
  });

  it('store 완료 뒤 abort되면 DB 완료 전에 cache 실패를 고정하고 stale lease를 덮어쓰지 않는다', async () => {
    const controller = new AbortController();
    const item = workItem('abort-after-store');
    const repository = new MemoryTtsRepository([item]);
    repository.completionByItemId.set(item.itemId, 'STALE_LEASE');
    let resolveStore!: (value: Awaited<ReturnType<TtsAudioStore['put']>>) => void;
    const storeResult = new Promise<
      Awaited<ReturnType<TtsAudioStore['put']>>
    >((resolve) => {
      resolveStore = resolve;
    });
    const store: TtsAudioStore = { put: vi.fn(() => storeResult) };
    const processing = new TtsProcessor(
      repository,
      createProvider(),
      store,
      () => now,
    ).process(jobId, controller.signal);
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledOnce());

    controller.abort();
    const bytes = providerResult().bytes;
    resolveStore({
      storageKey: `private/tts/${item.cacheKey}.wav`,
      mimeType: 'audio/wav',
      sizeBytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });

    await expect(processing).resolves.toBe('RUNNING');
    expect(repository.succeeded).toEqual([]);
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_PROCESS_ABORTED',
        audioClaim: expect.objectContaining({ resolution: 'FAILED' }),
      }),
    ]);
    expect(repository.generating.has(item.cacheKey)).toBe(false);
  });

  it('claim 직후 abort되면 provider를 호출하지 않고 active lease일 때만 실패를 남긴다', async () => {
    const controller = new AbortController();
    const item = workItem('abort-after-claim');
    const repository = new MemoryTtsRepository([item]);
    repository.afterClaim = () => controller.abort();
    const provider = createProvider();

    await expect(
      new TtsProcessor(repository, provider, createStore(), () => now).process(
        jobId,
        controller.signal,
      ),
    ).resolves.toBe('FAILED');
    expect(provider.synthesize).not.toHaveBeenCalled();
    expect(repository.failed).toEqual([
      expect.objectContaining({ errorCode: 'TTS_PROCESS_ABORTED' }),
    ]);
  });

  it('production provider 미구성 adapter는 안정적인 terminal 오류를 저장한다', async () => {
    const repository = new MemoryTtsRepository([workItem('item-1')]);

    await new TtsProcessor(
      repository,
      new UnavailableTtsProvider(),
      createStore(),
      () => now,
    ).process(jobId, new AbortController().signal);

    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_PROVIDER_UNAVAILABLE',
        retryable: false,
      }),
    ]);
  });
});
