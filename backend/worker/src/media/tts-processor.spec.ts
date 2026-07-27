/** TTS processor의 재사용·동시성·부분 실패와 안전한 공급자 실패를 검증한다 */
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
  staleItemIds = new Set<string>();

  constructor(private readonly pending: TtsWorkItem[]) {}

  claimNext(): Promise<TtsWorkItem | null> {
    return Promise.resolve(this.pending.shift() ?? null);
  }

  claimAudio(
    cacheKey: string,
  ): ReturnType<TtsProcessorRepository['claimAudio']> {
    const ready = this.readyByCacheKey.get(cacheKey);
    if (ready) return Promise.resolve({ kind: 'REUSE', mediaAssetId: ready });
    if (this.generating.has(cacheKey)) {
      return Promise.resolve({ kind: 'OUTCOME_UNKNOWN' });
    }
    this.generating.add(cacheKey);
    return Promise.resolve({
      kind: 'GENERATE',
      claimToken: `claim-${cacheKey}`,
    });
  }

  succeed(
    input: Parameters<TtsProcessorRepository['succeed']>[0],
  ): Promise<boolean> {
    this.succeeded.push(input);
    if (this.staleItemIds.has(input.item.itemId)) return Promise.resolve(false);

    const attachedMediaAssetId =
      input.kind === 'REUSED'
        ? input.mediaAssetId
        : `media-${input.media.sha256.slice(0, 12)}`;
    if (input.kind === 'GENERATED') {
      this.readyByCacheKey.set(input.item.cacheKey, attachedMediaAssetId);
      this.generating.delete(input.item.cacheKey);
    }
    this.attachments.push({
      itemId: input.item.itemId,
      mediaAssetId: attachedMediaAssetId,
    });
    return Promise.resolve(true);
  }

  fail(input: Parameters<TtsProcessorRepository['fail']>[0]): Promise<boolean> {
    this.failed.push(input);
    return Promise.resolve(true);
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
  put: vi.fn(({ cacheKey }) =>
    Promise.resolve({ storageKey: `private/tts/${cacheKey}.wav` }),
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

  it('같은 key 두 item의 동시 처리는 provider 한 번과 media 연결 두 건만 남긴다', async () => {
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
    const processor = new TtsProcessor(
      repository,
      provider,
      createStore(),
      () => now,
    );
    const first = processor.process(jobId, new AbortController().signal);
    await vi.waitFor(() => expect(provider.synthesize).toHaveBeenCalledOnce());
    const second = processor.process(jobId, new AbortController().signal);

    releaseProvider();
    await expect(Promise.all([first, second])).resolves.toEqual([
      'SUCCEEDED',
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
    repository.generating.add(item.cacheKey);
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
    repository.staleItemIds.add(stale.itemId);
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
      }),
    ]);
    expect(repository.attachments).toEqual([
      expect.objectContaining({ itemId: next.itemId }),
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

  it('처리 중 abort는 현재 item을 retryable 실패로 남기고 새 item을 claim하지 않는다', async () => {
    const controller = new AbortController();
    const repository = new MemoryTtsRepository([
      workItem('aborted'),
      workItem('unclaimed'),
    ]);
    const provider = createProvider(({ signal }) => {
      controller.abort(new Error('stop'));
      return Promise.reject(signal.reason);
    });

    await expect(
      new TtsProcessor(repository, provider, createStore(), () => now).process(
        jobId,
        controller.signal,
      ),
    ).resolves.toBe('FAILED');
    expect(repository.failed).toEqual([
      expect.objectContaining({
        errorCode: 'TTS_PROCESS_ABORTED',
        retryable: true,
      }),
    ]);
    expect(provider.synthesize).toHaveBeenCalledOnce();
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
