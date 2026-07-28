/** 참조 없는 TTS audio object를 lease 소유권 아래 검증·삭제한다 */
import type { TtsAudioGarbageStore } from '@flex-thia/domain';
import type { GeneratedTtsMedia } from './tts-processor.js';

/** GC side effect 전에 DB가 참조 확인과 storage-key 직렬화를 끝내는 port */
export interface TtsAudioGcRepository {
  claimAudioGcBatch(input: {
    workerId: string;
    batchSize: number;
    leaseDurationMs: number;
  }): Promise<
    Array<{
      id: string;
      leaseOwner: string;
      media: GeneratedTtsMedia;
    }>
  >;
  acknowledgeAudioDeleted(input: {
    id: string;
    leaseOwner: string;
    deletedAt: Date;
  }): Promise<boolean>;
  releaseAudioGc(input: {
    id: string;
    leaseOwner: string;
    failedAt: Date;
    nextAvailableAt: Date;
    errorCode: string;
  }): Promise<boolean>;
}

const sameAudio = (
  actual: GeneratedTtsMedia,
  expected: GeneratedTtsMedia,
): boolean =>
  actual.storageKey === expected.storageKey &&
  actual.mimeType === expected.mimeType &&
  actual.sizeBytes === expected.sizeBytes &&
  actual.sha256 === expected.sha256;

/** DB claim 뒤 object side effect만 수행해 READY commit과 삭제를 분리한다 */
export class TtsAudioGarbageCollector {
  constructor(
    private readonly repository: TtsAudioGcRepository,
    private readonly store: TtsAudioGarbageStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 한 lease batch를 처리하고 terminal 삭제와 release 수를 반환한다 */
  async processBatch(input: {
    workerId: string;
    batchSize: number;
    leaseDurationMs: number;
    retryDelayMs: number;
  }): Promise<{ claimed: number; deleted: number; released: number }> {
    const claims = await this.repository.claimAudioGcBatch(input);
    let deleted = 0;
    let released = 0;

    for (const claim of claims) {
      let errorCode: string | null = null;
      try {
        const beforeDelete = await this.store.inspect(claim.media.storageKey);
        if (beforeDelete !== null && !sameAudio(beforeDelete, claim.media)) {
          errorCode = 'TTS_AUDIO_GC_METADATA_MISMATCH';
        } else if (beforeDelete !== null) {
          await this.store.delete(claim.media.storageKey);
          if ((await this.store.inspect(claim.media.storageKey)) !== null) {
            errorCode = 'TTS_AUDIO_GC_DELETE_UNCONFIRMED';
          }
        }
      } catch {
        errorCode = 'TTS_AUDIO_GC_DELETE_FAILED';
      }

      const finishedAt = this.now();
      if (errorCode === null) {
        if (
          await this.repository.acknowledgeAudioDeleted({
            id: claim.id,
            leaseOwner: claim.leaseOwner,
            deletedAt: finishedAt,
          })
        ) {
          deleted += 1;
        }
        continue;
      }

      if (
        await this.repository.releaseAudioGc({
          id: claim.id,
          leaseOwner: claim.leaseOwner,
          failedAt: finishedAt,
          nextAvailableAt: new Date(finishedAt.getTime() + input.retryDelayMs),
          errorCode,
        })
      ) {
        released += 1;
      }
    }
    return { claimed: claims.length, deleted, released };
  }
}
