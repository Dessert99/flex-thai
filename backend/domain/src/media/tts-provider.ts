/** TTS 공급자·음성 저장소·콘텐츠 대상 연결을 위한 framework 독립 port를 정의한다 */
import type { TtsTargetSnapshot, TtsVoiceSnapshot } from './tts-job.js';

/** TTS 공급자가 합성 결과와 운영 metadata를 반환하는 계약 */
export interface TtsProviderResult {
  bytes: Uint8Array;
  mimeType: 'audio/wav';
  usage: Record<string, number>;
  estimatedCostUsd: string;
  providerRequestId: string | null;
}

/** voice snapshot을 사용해 TTS를 합성하는 외부 공급자 port */
export interface TtsProvider {
  synthesize(input: {
    text: string;
    voice: TtsVoiceSnapshot;
    signal: AbortSignal;
  }): Promise<TtsProviderResult>;
}

/** 생성한 WAV bytes를 cache key 아래 immutable object로 보존하는 storage port */
export interface TtsAudioStore {
  put(input: {
    cacheKey: string;
    bytes: Uint8Array;
    mimeType: 'audio/wav';
    sha256: string;
  }): Promise<{
    storageKey: string;
    mimeType: 'audio/wav';
    sizeBytes: number;
    sha256: string;
  }>;
}

/** GC worker가 immutable audio object를 검증한 뒤 멱등 삭제하는 storage port */
export interface TtsAudioGarbageStore {
  inspect(storageKey: string): Promise<{
    storageKey: string;
    mimeType: 'audio/wav';
    sizeBytes: number;
    sha256: string;
  } | null>;
  delete(storageKey: string): Promise<void>;
}

/** target revision이 아직 유효할 때만 생성 음성을 원자 연결하는 repository port */
export interface TtsTargetAttachmentRepository {
  attach(input: {
    target: TtsTargetSnapshot;
    mediaAssetId: string;
    expectedRevision: string;
  }): Promise<'ATTACHED' | 'STALE_TARGET'>;
}
