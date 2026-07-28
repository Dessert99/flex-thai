/** 운영 object storage 미구성 시 생성과 GC를 모두 fail-closed로 막는다 */
import type { TtsAudioGarbageStore, TtsAudioStore } from '@flex-thia/domain';

/** TTS object storage 미구성 상태를 안정 code로 보존한다 */
export class UnavailableTtsAudioStoreError extends Error {
  readonly code = 'TTS_AUDIO_STORE_UNAVAILABLE';
  readonly retryable = false;

  constructor() {
    super('TTS_AUDIO_STORE_UNAVAILABLE');
    this.name = 'UnavailableTtsAudioStoreError';
  }
}

/** 안전한 inspect/delete 설정 전 object 생성과 삭제를 모두 거절한다 */
export class UnavailableTtsAudioStore
  implements TtsAudioStore, TtsAudioGarbageStore
{
  /** 미구성 storage에 object를 보였다고 거짓 성공하지 않는다 */
  put(_input: Parameters<TtsAudioStore['put']>[0]): Promise<never> {
    void _input;
    return Promise.reject(new UnavailableTtsAudioStoreError());
  }

  /** 참조 확인 없는 production object 조회를 거절해 GC가 release하게 한다 */
  inspect(_storageKey: string): Promise<never> {
    void _storageKey;
    return Promise.reject(new UnavailableTtsAudioStoreError());
  }

  /** 안전한 production delete adapter가 없으면 object를 지우지 않는다 */
  delete(_storageKey: string): Promise<never> {
    void _storageKey;
    return Promise.reject(new UnavailableTtsAudioStoreError());
  }
}
