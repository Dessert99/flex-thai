/** TTS job 항목을 DB cache claim·합성·immutable 저장·원자 완료 순서로 처리한다 */
import { createHash } from 'node:crypto';
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

/** 생성 claim의 known 실패 해제와 외부 결과 불명확 고정을 구분한다 */
export interface TtsAudioClaimFinalization {
  claimToken: string;
  resolution: 'RELEASE' | 'OUTCOME_UNKNOWN';
}

/** DB transaction이 TTS 완료를 수락하거나 거절한 정확한 이유 */
export type TtsProcessorCompletionResult =
  | { kind: 'COMPLETED'; mediaAssetId: string }
  | {
      kind:
        'STALE_LEASE' | 'STALE_CACHE_CLAIM' | 'STALE_TARGET' | 'MEDIA_CONFLICT';
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
  | { kind: 'OUTCOME_UNKNOWN' };

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
  constructor(
    private readonly repository: TtsProcessorRepository,
    private readonly provider: TtsProvider,
    private readonly audioStore: TtsAudioStore,
    private readonly now: () => Date = () => new Date(),
    private readonly wait: (signal: AbortSignal) => Promise<void> = waitForPoll,
  ) {}

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

    let claim: UsableAudioClaim | null;
    try {
      claim = await this.waitForAudioClaim(item, signal);
    } catch {
      await this.recordFailure(item, {
        errorCode: 'TTS_PROCESS_ABORTED',
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
        resolution: 'RELEASE',
      });
      return;
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
      await this.failOwnedClaim(item, claim, {
        errorCode: failure.errorCode,
        retryable: failure.retryable,
        resolution: failure.outcomeUnknown ? 'OUTCOME_UNKNOWN' : 'RELEASE',
      });
      return;
    }

    if (signal.aborted) {
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_PROCESS_ABORTED',
        retryable: true,
        resolution: 'RELEASE',
      });
      return;
    }
    if (result.bytes.byteLength === 0) {
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_PROVIDER_EMPTY_AUDIO',
        retryable: false,
        resolution: 'RELEASE',
      });
      return;
    }

    const sha256 = createHash('sha256').update(result.bytes).digest('hex');
    let stored: { storageKey: string };
    try {
      stored = await this.audioStore.put({
        cacheKey: item.cacheKey,
        bytes: result.bytes,
        mimeType: result.mimeType,
        sha256,
      });
    } catch {
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_AUDIO_STORE_FAILED',
        retryable: true,
        resolution: 'RELEASE',
      });
      return;
    }

    if (signal.aborted) {
      await this.failOwnedClaim(item, claim, {
        errorCode: 'TTS_PROCESS_ABORTED',
        retryable: true,
        resolution: 'RELEASE',
      });
      return;
    }

    const completion = await this.repository.succeed({
      kind: 'GENERATED',
      item,
      claimToken: claim.claimToken,
      media: {
        storageKey: stored.storageKey,
        mimeType: result.mimeType,
        sizeBytes: result.bytes.byteLength,
        sha256,
      },
      completedAt: this.now(),
    });
    await this.handleCompletion(item, completion, claim);
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
          { claimToken: claim.claimToken, resolution: 'RELEASE' },
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
            : 'TTS_MEDIA_IMMUTABLE_CONFLICT',
        retryable: false,
      },
      claim
        ? { claimToken: claim.claimToken, resolution: 'RELEASE' }
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
    const result = await this.recordFailure(item, failure, {
      claimToken: claim.claimToken,
      resolution: failure.resolution,
    });
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
