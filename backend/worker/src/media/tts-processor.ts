/** TTS job 항목을 DB cache claim·합성·immutable 저장·원자 완료 순서로 처리한다 */
import { createHash, randomUUID } from 'node:crypto';
import { ttsAudioGcWriteGraceMs } from '@flex-thia/database';
import type {
  TtsAudioStore,
  TtsFailureInput,
  TtsJobStatus,
  TtsProvider,
  TtsProviderResult,
  TtsWorkItem,
} from '@flex-thia/domain';

/** 생성 음성을 READY media로 원자 등록할 때 필요한 검증 metadata */
export interface GeneratedTtsMedia {
  storageKey: string;
  mimeType: 'audio/wav';
  sizeBytes: number;
  sha256: string;
}

/** provider 호출을 재실행하지 않고 복구할 수 있는 item attempt outcome */
export type TtsProviderRunReplay =
  | {
      kind: 'SUCCEEDED';
      runId: string;
      cacheClaimToken: string;
      usage: Record<string, number>;
      estimatedCostUsd: string;
      providerRequestId: string | null;
      media: GeneratedTtsMedia;
    }
  | {
      kind: 'FAILED';
      runId: string;
      cacheClaimToken: string;
      errorCode: string;
      retryable: boolean;
    }
  | {
      kind: 'OUTCOME_UNKNOWN';
      runId?: string;
      cacheClaimToken: string;
    }
  | {
      kind: 'IN_PROGRESS';
      runId: string;
      cacheClaimToken: string;
    };

/** provider 실행 claim·terminal과 object GC 등록을 worker에 제공하는 저장 경계 */
export interface TtsProcessorDurabilityRepository {
  findProviderRun(
    item: Pick<TtsWorkItem, 'itemId' | 'attempt' | 'leaseToken'>,
  ): Promise<TtsProviderRunReplay | null>;
  claimProviderRun(input: {
    item: Pick<TtsWorkItem, 'itemId' | 'attempt' | 'leaseToken'>;
    cacheKey: string;
    cacheClaimToken: string;
    provider: string;
    model: string;
    claimedAt: Date;
  }): Promise<{ kind: 'CLAIMED'; runId: string } | TtsProviderRunReplay>;
  succeedProviderRun(input: {
    runId: string;
    usage: Record<string, number>;
    estimatedCostUsd: string;
    providerRequestId: string | null;
    media: GeneratedTtsMedia;
    finishedAt: Date;
  }): Promise<boolean>;
  failProviderRun(input: {
    runId: string;
    status: 'FAILED' | 'OUTCOME_UNKNOWN';
    errorCode: string;
    retryable: boolean;
    usage?: Record<string, number>;
    estimatedCostUsd?: string;
    providerRequestId?: string | null;
    finishedAt: Date;
  }): Promise<boolean>;
  registerAudioGc(input: {
    media: GeneratedTtsMedia;
    registeredAt: Date;
  }): Promise<void>;
}

/** 생성 claim의 known 실패와 외부 결과 불명확 상태를 cache에 고정한다 */
export type TtsAudioClaimFinalization =
  | {
      claimToken: string;
      resolution: 'FAILED';
      errorCode: string;
      retryable: boolean;
    }
  | {
      claimToken: string;
      resolution: 'OUTCOME_UNKNOWN';
    };

/** DB transaction이 TTS 완료를 수락하거나 거절한 정확한 이유 */
export type TtsProcessorCompletionResult =
  | { kind: 'COMPLETED'; mediaAssetId: string }
  | {
      kind:
        | 'STALE_LEASE'
        | 'STALE_CACHE_CLAIM'
        | 'STALE_TARGET'
        | 'MEDIA_CONFLICT'
        | 'AUDIO_DELETED';
    };

/** DB transaction이 item 실패를 저장했는지 구분한다 */
export type TtsProcessorFailureResult =
  { kind: 'FAILED' } | { kind: 'STALE_LEASE' | 'STALE_CACHE_CLAIM' };

/** worker가 TTS item lease와 cache 상태를 조정하는 저장 경계 */
export interface TtsProcessorRepository {
  claimNext(jobId: string, now: Date): Promise<TtsWorkItem | null>;
  claimAudio(
    cacheKey: string,
  ): Promise<
    | { kind: 'GENERATE'; claimToken: string }
    | { kind: 'REUSE'; mediaAssetId: string }
    | { kind: 'WAIT' }
    | { kind: 'FAILED'; errorCode: string; retryable: boolean }
    | { kind: 'OUTCOME_UNKNOWN' }
  >;
  succeed(
    input:
      | {
          kind: 'GENERATED';
          item: TtsWorkItem;
          claimToken: string;
          media: GeneratedTtsMedia;
          completedAt: Date;
        }
      | {
          kind: 'REUSED';
          item: TtsWorkItem;
          mediaAssetId: string;
          completedAt: Date;
        },
  ): Promise<TtsProcessorCompletionResult>;
  fail(
    input: TtsFailureInput & { audioClaim?: TtsAudioClaimFinalization },
  ): Promise<TtsProcessorFailureResult>;
  finalizeAudioClaim(
    cacheKey: string,
    audioClaim: TtsAudioClaimFinalization,
    finalizedAt: Date,
  ): Promise<'FINALIZED' | 'STALE_CACHE_CLAIM'>;
  getJobStatus(jobId: string): Promise<TtsJobStatus | null>;
}

class TtsProcessorError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly outcomeUnknown = false,
  ) {
    super(code);
    this.name = 'TtsProcessorError';
  }
}

type OwnedAudioClaim = { kind: 'GENERATE'; claimToken: string };
type UsableAudioClaim =
  | OwnedAudioClaim
  | { kind: 'REUSE'; mediaAssetId: string }
  | { kind: 'FAILED'; errorCode: string; retryable: boolean }
  | { kind: 'OUTCOME_UNKNOWN' };

const defaultTtsAudioWriteTimeoutMs = ttsAudioGcWriteGraceMs - 60_000;

const asProviderFailure = (
  error: unknown,
  signal: AbortSignal,
): {
  errorCode: string;
  retryable: boolean;
  outcomeUnknown: boolean;
} => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'retryable' in error &&
    typeof error.retryable === 'boolean'
  ) {
    return {
      errorCode: error.code,
      retryable: error.retryable,
      outcomeUnknown:
        'outcomeUnknown' in error && error.outcomeUnknown === true,
    };
  }
  if (signal.aborted) {
    return {
      errorCode: 'TTS_PROVIDER_OUTCOME_UNKNOWN',
      retryable: false,
      outcomeUnknown: true,
    };
  }
  return {
    errorCode: 'TTS_PROVIDER_FAILED',
    retryable: true,
    outcomeUnknown: false,
  };
};

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'AbortError';

const waitForPoll = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new TtsProcessorError('TTS_PROCESS_ABORTED', true));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 100);
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(new TtsProcessorError('TTS_PROCESS_ABORTED', true));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

/** 운영 TTS provider 미구성 상태를 외부 호출 없는 terminal 오류로 표현한다 */
export class UnavailableTtsProvider implements TtsProvider {
  /** provider 설정 전에는 비용 호출 대신 안정적인 unavailable 오류를 반환한다 */
  synthesize(): Promise<never> {
    return Promise.reject(
      new TtsProcessorError('TTS_PROVIDER_UNAVAILABLE', false),
    );
  }
}

/** DB cache claim 재확인과 item별 실패 격리를 조정한다 */
export class TtsProcessor {
  private readonly audioWriteTimeoutMs: number;

  constructor(
    private readonly repository: TtsProcessorRepository,
    private readonly provider: TtsProvider,
    private readonly audioStore: TtsAudioStore,
    private readonly now: () => Date = () => new Date(),
    private readonly wait: (signal: AbortSignal) => Promise<void> = waitForPoll,
    private readonly durability?: TtsProcessorDurabilityRepository,
    audioWriteTimeoutMs = defaultTtsAudioWriteTimeoutMs,
  ) {
    if (
      !Number.isSafeInteger(audioWriteTimeoutMs) ||
      audioWriteTimeoutMs <= 0 ||
      audioWriteTimeoutMs >= ttsAudioGcWriteGraceMs
    ) {
      throw new TtsProcessorError('TTS_AUDIO_WRITE_TIMEOUT_INVALID', false);
    }
    this.audioWriteTimeoutMs = audioWriteTimeoutMs;
  }

  /** claim 가능한 항목을 처리한 뒤 repository의 canonical job 상태를 반환한다 */
  async process(jobId: string, signal: AbortSignal): Promise<TtsJobStatus> {
    while (!signal.aborted) {
      const item = await this.repository.claimNext(jobId, this.now());
      if (!item) break;
      await this.processItem(item, signal);
    }

    return (await this.repository.getJobStatus(jobId)) ?? 'FAILED';
  }

  private async processItem(
    item: TtsWorkItem,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      await this.recordFailure(item, {
        errorCode: 'TTS_PROCESS_ABORTED',
        retryable: true,
      });
      return;
    }

    const storedRun = await this.durability?.findProviderRun(item);
    if (storedRun) {
      await this.handleProviderRunReplay(item, storedRun);
      return;
    }

    let claim: UsableAudioClaim | null;
    try {
      claim = await this.waitForAudioClaim(item, signal);
    } catch (error) {
      await this.recordFailure(item, {
        errorCode:
          signal.aborted || isAbortError(error)
            ? 'TTS_PROCESS_ABORTED'
            : 'TTS_CACHE_CLAIM_FAILED',
        retryable: true,
      });
      return;
    }
    if (!claim) return;

    if (claim.kind === 'OUTCOME_UNKNOWN') {
      await this.recordFailure(item, {
        errorCode: 'TTS_PROVIDER_OUTCOME_UNKNOWN',
        retryable: false,
      });
      return;
    }

    if (claim.kind === 'FAILED') {
      await this.recordFailure(item, {
        errorCode: claim.errorCode,
        retryable: claim.retryable,
      });
      return;
    }

    if (claim.kind === 'REUSE') {
      if (signal.aborted) {
        await this.recordFailure(item, {
          errorCode: 'TTS_PROCESS_ABORTED',
          retryable: true,
        });
        return;
      }
      const completion = await this.repository.succeed({
        kind: 'REUSED',
        item,
        mediaAssetId: claim.mediaAssetId,
        completedAt: this.now(),
      });
      await this.handleCompletion(item, completion);
      return;
    }

    await this.generate(item, claim, signal);
  }

  private async generate(
    item: TtsWorkItem,
    claim: OwnedAudioClaim,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_PROCESS_ABORTED',
        retryable: true,
        resolution: 'FAILED',
      });
      return;
    }

    let providerRunId: string | null = null;
    if (this.durability) {
      const providerClaim = await this.durability.claimProviderRun({
        item,
        cacheKey: item.cacheKey,
        cacheClaimToken: claim.claimToken,
        provider: item.voice.provider,
        model: item.voice.model,
        claimedAt: this.now(),
      });
      if (providerClaim.kind !== 'CLAIMED') {
        await this.handleProviderRunReplay(item, providerClaim);
        return;
      }
      providerRunId = providerClaim.runId;
    }

    let result: TtsProviderResult;
    try {
      result = await this.provider.synthesize({
        text: item.target.text,
        voice: item.voice,
        signal,
      });
    } catch (error) {
      const failure = asProviderFailure(error, signal);
      const replay = await this.persistProviderFailure(item, providerRunId, {
        status: failure.outcomeUnknown ? 'OUTCOME_UNKNOWN' : 'FAILED',
        errorCode: failure.errorCode,
        retryable: failure.retryable,
      });
      if (replay) {
        await this.handleProviderRunReplay(item, replay);
        return;
      }
      await this.failOwnedClaim(item, claim, {
        errorCode: failure.errorCode,
        retryable: failure.retryable,
        resolution: failure.outcomeUnknown ? 'OUTCOME_UNKNOWN' : 'FAILED',
      });
      return;
    }

    if (signal.aborted) {
      const replay = await this.persistKnownProviderFailure(
        item,
        providerRunId,
        result,
        'TTS_PROCESS_ABORTED',
        true,
      );
      if (replay) {
        await this.handleProviderRunReplay(item, replay);
        return;
      }
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_PROCESS_ABORTED',
        retryable: true,
        resolution: 'FAILED',
      });
      return;
    }
    if (result.bytes.byteLength === 0) {
      const replay = await this.persistKnownProviderFailure(
        item,
        providerRunId,
        result,
        'TTS_PROVIDER_EMPTY_AUDIO',
        false,
      );
      if (replay) {
        await this.handleProviderRunReplay(item, replay);
        return;
      }
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_PROVIDER_EMPTY_AUDIO',
        retryable: false,
        resolution: 'FAILED',
      });
      return;
    }

    const sha256 = createHash('sha256').update(result.bytes).digest('hex');
    const runIdentity = providerRunId ?? randomUUID();
    const expectedMedia: GeneratedTtsMedia = {
      storageKey: `private/tts/runs/${runIdentity}.wav`,
      mimeType: result.mimeType,
      sizeBytes: result.bytes.byteLength,
      sha256,
    };
    if (this.durability) {
      try {
        // write 전에 exact key tombstone을 남겨 hard crash도 GC가 회수하게 한다.
        await this.durability.registerAudioGc({
          media: expectedMedia,
          registeredAt: this.now(),
        });
      } catch {
        const replay = await this.persistKnownProviderFailure(
          item,
          providerRunId,
          result,
          'TTS_AUDIO_GC_REGISTRATION_FAILED',
          true,
        );
        if (replay) {
          await this.handleProviderRunReplay(item, replay);
          return;
        }
        await this.failOwnedClaim(item, claim, {
          errorCode: 'TTS_AUDIO_GC_REGISTRATION_FAILED',
          retryable: true,
          resolution: 'FAILED',
        });
        return;
      }
    }
    let stored: Awaited<ReturnType<TtsAudioStore['put']>>;
    const writeController = new AbortController();
    let writeTimedOut = false;
    const abortWrite = (): void => writeController.abort(signal.reason);
    if (signal.aborted) abortWrite();
    else signal.addEventListener('abort', abortWrite, { once: true });
    const writeDeadline = new Date(
      this.now().getTime() + this.audioWriteTimeoutMs,
    );
    const writeTimeout = setTimeout(() => {
      writeTimedOut = true;
      writeController.abort();
    }, this.audioWriteTimeoutMs);
    try {
      stored = await this.audioStore.put({
        storageKey: expectedMedia.storageKey,
        bytes: result.bytes,
        mimeType: result.mimeType,
        sha256,
        signal: writeController.signal,
        deadline: writeDeadline,
      });
    } catch {
      const errorCode = signal.aborted
        ? 'TTS_PROCESS_ABORTED'
        : writeTimedOut
          ? 'TTS_AUDIO_STORE_TIMEOUT'
          : 'TTS_AUDIO_STORE_FAILED';
      const replay = await this.persistKnownProviderFailure(
        item,
        providerRunId,
        result,
        errorCode,
        true,
      );
      if (replay) {
        await this.handleProviderRunReplay(item, replay);
        return;
      }
      await this.failOwnedClaim(item, claim, {
        errorCode,
        retryable: true,
        resolution: 'FAILED',
      });
      return;
    } finally {
      clearTimeout(writeTimeout);
      signal.removeEventListener('abort', abortWrite);
    }

    const storedMedia: GeneratedTtsMedia = {
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
    };
    if (
      stored.storageKey !== expectedMedia.storageKey ||
      stored.mimeType !== result.mimeType ||
      stored.sizeBytes !== result.bytes.byteLength ||
      stored.sha256 !== sha256
    ) {
      const replay = await this.persistKnownProviderFailure(
        item,
        providerRunId,
        result,
        'TTS_AUDIO_STORE_METADATA_MISMATCH',
        true,
      );
      if (replay) {
        await this.handleProviderRunReplay(item, replay);
        return;
      }
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_AUDIO_STORE_METADATA_MISMATCH',
        retryable: true,
        resolution: 'FAILED',
      });
      return;
    }

    if (signal.aborted) {
      const replay = await this.persistKnownProviderFailure(
        item,
        providerRunId,
        result,
        'TTS_PROCESS_ABORTED',
        true,
      );
      if (replay) {
        await this.handleProviderRunReplay(item, replay);
        return;
      }
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_PROCESS_ABORTED',
        retryable: true,
        resolution: 'FAILED',
      });
      return;
    }

    if (
      providerRunId &&
      this.durability &&
      !(await this.durability.succeedProviderRun({
        runId: providerRunId,
        ...this.providerAccounting(result),
        media: storedMedia,
        finishedAt: this.now(),
      }))
    ) {
      const replay = await this.durability.findProviderRun(item);
      if (replay) {
        await this.handleProviderRunReplay(item, replay);
        return;
      }
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_PROVIDER_OUTCOME_UNKNOWN',
        retryable: false,
        resolution: 'OUTCOME_UNKNOWN',
      });
      return;
    }

    const completion = await this.repository.succeed({
      kind: 'GENERATED',
      item,
      claimToken: claim.claimToken,
      media: storedMedia,
      completedAt: this.now(),
    });
    await this.handleCompletion(item, completion, claim);
  }

  private providerAccounting(result: TtsProviderResult): {
    usage: Record<string, number>;
    estimatedCostUsd: string;
    providerRequestId: string | null;
  } {
    return {
      usage: result.usage,
      estimatedCostUsd: result.estimatedCostUsd,
      providerRequestId: result.providerRequestId,
    };
  }

  private persistKnownProviderFailure(
    item: TtsWorkItem,
    runId: string | null,
    result: TtsProviderResult,
    errorCode: string,
    retryable: boolean,
  ): Promise<TtsProviderRunReplay | null> {
    return this.persistProviderFailure(item, runId, {
      status: 'FAILED',
      errorCode,
      retryable,
      ...this.providerAccounting(result),
    });
  }

  private async persistProviderFailure(
    item: TtsWorkItem,
    runId: string | null,
    failure: {
      status: 'FAILED' | 'OUTCOME_UNKNOWN';
      errorCode: string;
      retryable: boolean;
      usage?: Record<string, number>;
      estimatedCostUsd?: string;
      providerRequestId?: string | null;
    },
  ): Promise<TtsProviderRunReplay | null> {
    if (!runId || !this.durability) return null;
    if (
      await this.durability.failProviderRun({
        ...failure,
        runId,
        finishedAt: this.now(),
      })
    ) {
      return null;
    }
    return this.durability.findProviderRun(item);
  }

  private async handleProviderRunReplay(
    item: TtsWorkItem,
    replay: TtsProviderRunReplay,
  ): Promise<void> {
    if (replay.kind === 'IN_PROGRESS') return;
    if (replay.kind === 'SUCCEEDED') {
      await this.durability?.registerAudioGc({
        media: replay.media,
        registeredAt: this.now(),
      });
      const completion = await this.repository.succeed({
        kind: 'GENERATED',
        item,
        claimToken: replay.cacheClaimToken,
        media: replay.media,
        completedAt: this.now(),
      });
      await this.handleCompletion(item, completion, {
        kind: 'GENERATE',
        claimToken: replay.cacheClaimToken,
      });
      return;
    }

    const outcomeUnknown = replay.kind === 'OUTCOME_UNKNOWN';
    await this.failOwnedClaim(
      item,
      { kind: 'GENERATE', claimToken: replay.cacheClaimToken },
      {
        errorCode: outcomeUnknown
          ? 'TTS_PROVIDER_OUTCOME_UNKNOWN'
          : replay.errorCode,
        retryable: outcomeUnknown ? false : replay.retryable,
        resolution: outcomeUnknown ? 'OUTCOME_UNKNOWN' : 'FAILED',
      },
    );
  }

  private async waitForAudioClaim(
    item: TtsWorkItem,
    signal: AbortSignal,
  ): Promise<UsableAudioClaim | null> {
    while (!signal.aborted && this.now() < item.leaseUntil) {
      const claim = await this.repository.claimAudio(item.cacheKey);
      if (claim.kind !== 'WAIT') return claim;
      await this.wait(signal);
    }
    if (signal.aborted) {
      throw new TtsProcessorError('TTS_PROCESS_ABORTED', true);
    }
    return null;
  }

  private async handleCompletion(
    item: TtsWorkItem,
    completion: TtsProcessorCompletionResult,
    claim?: OwnedAudioClaim,
  ): Promise<void> {
    if (completion.kind === 'COMPLETED') return;
    if (completion.kind === 'STALE_LEASE') {
      if (claim) {
        await this.repository.finalizeAudioClaim(
          item.cacheKey,
          {
            claimToken: claim.claimToken,
            resolution: 'FAILED',
            errorCode: 'TTS_ITEM_STALE_LEASE',
            retryable: true,
          },
          this.now(),
        );
      }
      return;
    }
    if (completion.kind === 'STALE_CACHE_CLAIM') {
      await this.recordFailure(item, {
        errorCode: 'TTS_CACHE_CLAIM_STALE',
        retryable: true,
      });
      return;
    }

    await this.recordFailure(
      item,
      {
        errorCode:
          completion.kind === 'STALE_TARGET'
            ? 'TTS_TARGET_STALE'
            : completion.kind === 'AUDIO_DELETED'
              ? 'TTS_AUDIO_OBJECT_DELETED'
              : 'TTS_MEDIA_IMMUTABLE_CONFLICT',
        retryable: false,
      },
      claim
        ? {
            claimToken: claim.claimToken,
            resolution: 'FAILED',
            errorCode:
              completion.kind === 'STALE_TARGET'
                ? 'TTS_TARGET_STALE'
                : completion.kind === 'AUDIO_DELETED'
                  ? 'TTS_AUDIO_OBJECT_DELETED'
                  : 'TTS_MEDIA_IMMUTABLE_CONFLICT',
            retryable: false,
          }
        : undefined,
    );
  }

  private async failOwnedClaim(
    item: TtsWorkItem,
    claim: OwnedAudioClaim,
    failure: {
      errorCode: string;
      retryable: boolean;
      resolution: TtsAudioClaimFinalization['resolution'];
    },
  ): Promise<void> {
    const audioClaim: TtsAudioClaimFinalization =
      failure.resolution === 'OUTCOME_UNKNOWN'
        ? {
            claimToken: claim.claimToken,
            resolution: 'OUTCOME_UNKNOWN',
          }
        : {
            claimToken: claim.claimToken,
            resolution: 'FAILED',
            errorCode: failure.errorCode,
            retryable: failure.retryable,
          };
    const result = await this.recordFailure(item, failure, audioClaim);
    if (result.kind === 'STALE_CACHE_CLAIM') {
      await this.recordFailure(item, {
        errorCode: 'TTS_CACHE_CLAIM_STALE',
        retryable: true,
      });
    }
  }

  private recordFailure(
    item: TtsWorkItem,
    failure: { errorCode: string; retryable: boolean },
    audioClaim?: TtsAudioClaimFinalization,
  ): Promise<TtsProcessorFailureResult> {
    return this.repository.fail({
      item,
      ...failure,
      ...(audioClaim ? { audioClaim } : {}),
      failedAt: this.now(),
    });
  }
}
