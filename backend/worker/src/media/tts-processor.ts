/** TTS job의 항목을 재사용 claim·합성·immutable 저장·원자 완료 순서로 처리한다 */
import { createHash } from 'node:crypto';
import type {
  TtsAudioStore,
  TtsFailureInput,
  TtsJobStatus,
  TtsProvider,
  TtsWorkItem,
} from '@flex-thia/domain';

/** 생성 음성을 READY media로 원자 등록할 때 필요한 검증 metadata */
export interface GeneratedTtsMedia {
  storageKey: string;
  mimeType: 'audio/wav';
  sizeBytes: number;
  sha256: string;
}

/** worker가 TTS 항목 lease와 음성 cache 완료에 요구하는 저장 경계 */
export interface TtsProcessorRepository {
  claimNext(jobId: string, now: Date): Promise<TtsWorkItem | null>;
  claimAudio(
    cacheKey: string,
  ): Promise<
    | { kind: 'GENERATE'; claimToken: string }
    | { kind: 'REUSE'; mediaAssetId: string }
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
  ): Promise<boolean>;
  fail(input: TtsFailureInput): Promise<boolean>;
}

class TtsProcessorError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'TtsProcessorError';
  }
}

interface AudioClaimOwner {
  claim:
    | { kind: 'GENERATE'; claimToken: string }
    | { kind: 'REUSE'; mediaAssetId: string }
    | { kind: 'OUTCOME_UNKNOWN' };
  release(): void;
}

const asFailure = (
  error: unknown,
  signal: AbortSignal,
  fallback: { code: string; retryable: boolean },
): { errorCode: string; retryable: boolean } => {
  if (signal.aborted) {
    return { errorCode: 'TTS_PROCESS_ABORTED', retryable: true };
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'retryable' in error &&
    typeof error.retryable === 'boolean'
  ) {
    return { errorCode: error.code, retryable: error.retryable };
  }
  if (error instanceof Error && error.message.startsWith('TTS_')) {
    return { errorCode: error.message, retryable: false };
  }
  return { errorCode: fallback.code, retryable: fallback.retryable };
};

const aggregateProcessedStatus = (
  succeeded: number,
  failed: number,
): TtsJobStatus => {
  if (failed === 0) return 'SUCCEEDED';
  if (succeeded === 0) return 'FAILED';
  return 'PARTIALLY_FAILED';
};

/** 운영 TTS provider 미구성 상태를 외부 호출 없는 terminal 오류로 표현한다 */
export class UnavailableTtsProvider implements TtsProvider {
  /** provider 설정 전에는 비용 호출 대신 안정적인 unavailable 오류를 반환한다 */
  synthesize(): Promise<never> {
    return Promise.reject(
      new TtsProcessorError('TTS_PROVIDER_UNAVAILABLE', false),
    );
  }
}

/** 같은 cache key의 단일 생성과 item별 실패 격리를 조정한다 */
export class TtsProcessor {
  private readonly activeAudioByCacheKey = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: TtsProcessorRepository,
    private readonly provider: TtsProvider,
    private readonly audioStore: TtsAudioStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** job의 claim 가능한 항목을 모두 처리하고 이번 실행의 terminal 집계를 반환한다 */
  async process(jobId: string, signal: AbortSignal): Promise<TtsJobStatus> {
    let succeeded = 0;
    let failed = 0;

    while (!signal.aborted) {
      const item = await this.repository.claimNext(jobId, this.now());
      if (!item) break;

      if (await this.processItem(item, signal)) succeeded += 1;
      else failed += 1;
    }

    if (succeeded === 0 && failed === 0 && signal.aborted) return 'FAILED';
    return aggregateProcessedStatus(succeeded, failed);
  }

  private async processItem(
    item: TtsWorkItem,
    signal: AbortSignal,
  ): Promise<boolean> {
    let owner: AudioClaimOwner | null = null;

    try {
      owner = await this.acquireAudioClaim(item.cacheKey, signal);
      if (owner.claim.kind === 'OUTCOME_UNKNOWN') {
        return this.recordFailure(item, {
          errorCode: 'TTS_PROVIDER_OUTCOME_UNKNOWN',
          retryable: false,
        });
      }

      if (owner.claim.kind === 'REUSE') {
        const completed = await this.repository.succeed({
          kind: 'REUSED',
          item,
          mediaAssetId: owner.claim.mediaAssetId,
          completedAt: this.now(),
        });
        return completed
          ? true
          : this.recordFailure(item, {
              errorCode: 'TTS_TARGET_STALE',
              retryable: false,
            });
      }

      let result;
      try {
        result = await this.provider.synthesize({
          text: item.target.text,
          voice: item.voice,
          signal,
        });
      } catch (error) {
        return this.recordFailure(
          item,
          asFailure(error, signal, {
            code: 'TTS_PROVIDER_FAILED',
            retryable: true,
          }),
        );
      }
      if (result.bytes.byteLength === 0) {
        return this.recordFailure(item, {
          errorCode: 'TTS_PROVIDER_EMPTY_AUDIO',
          retryable: false,
        });
      }

      const sha256 = createHash('sha256').update(result.bytes).digest('hex');
      let stored;
      try {
        stored = await this.audioStore.put({
          cacheKey: item.cacheKey,
          bytes: result.bytes,
          mimeType: result.mimeType,
          sha256,
        });
      } catch (error) {
        return this.recordFailure(
          item,
          asFailure(error, signal, {
            code: 'TTS_AUDIO_STORE_FAILED',
            retryable: true,
          }),
        );
      }

      try {
        const completed = await this.repository.succeed({
          kind: 'GENERATED',
          item,
          claimToken: owner.claim.claimToken,
          media: {
            storageKey: stored.storageKey,
            mimeType: result.mimeType,
            sizeBytes: result.bytes.byteLength,
            sha256,
          },
          completedAt: this.now(),
        });
        return completed
          ? true
          : this.recordFailure(item, {
              errorCode: 'TTS_TARGET_STALE',
              retryable: false,
            });
      } catch (error) {
        return this.recordFailure(
          item,
          asFailure(error, signal, {
            code: 'TTS_COMPLETION_FAILED',
            retryable: true,
          }),
        );
      }
    } catch (error) {
      return this.recordFailure(
        item,
        asFailure(error, signal, {
          code: 'TTS_PROCESSING_FAILED',
          retryable: true,
        }),
      );
    } finally {
      owner?.release();
    }
  }

  private async acquireAudioClaim(
    cacheKey: string,
    signal: AbortSignal,
  ): Promise<AudioClaimOwner> {
    while (true) {
      const active = this.activeAudioByCacheKey.get(cacheKey);
      if (active) {
        await this.waitForActiveAudio(active, signal);
        continue;
      }

      let releaseGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      this.activeAudioByCacheKey.set(cacheKey, gate);
      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        if (this.activeAudioByCacheKey.get(cacheKey) === gate) {
          this.activeAudioByCacheKey.delete(cacheKey);
        }
        releaseGate();
      };

      try {
        return {
          claim: await this.repository.claimAudio(cacheKey),
          release,
        };
      } catch (error) {
        release();
        throw error;
      }
    }
  }

  private waitForActiveAudio(
    active: Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      return Promise.reject(new TtsProcessorError('TTS_PROCESS_ABORTED', true));
    }

    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        reject(new TtsProcessorError('TTS_PROCESS_ABORTED', true));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      active.then(
        () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }

  private async recordFailure(
    item: TtsWorkItem,
    failure: { errorCode: string; retryable: boolean },
  ): Promise<false> {
    await this.repository.fail({
      item,
      ...failure,
      failedAt: this.now(),
    });
    return false;
  }
}
