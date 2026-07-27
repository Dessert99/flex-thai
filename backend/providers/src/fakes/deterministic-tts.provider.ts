/** 외부 호출 없이 text·voice 입력을 재현 가능한 PCM WAV로 합성한다 */
import { createHash } from 'node:crypto';
import type { TtsVoiceSnapshot } from '../../../domain/src/media/tts-job.js';
import type {
  TtsProvider,
  TtsProviderResult,
} from '../../../domain/src/media/tts-provider.js';

/** deterministic local TTS fixture가 worker에 전달하는 안정적인 오류 형태 */
export class DeterministicTtsProviderError extends Error {
  constructor(
    readonly code:
      | 'TTS_PROVIDER_TIMEOUT'
      | 'TTS_PROVIDER_RETRYABLE'
      | 'TTS_PROVIDER_TERMINAL',
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'DeterministicTtsProviderError';
  }
}

const sampleRate = 8_000;
const sampleCount = 80;
const wavHeaderBytes = 44;

const writeAscii = (bytes: Uint8Array, offset: number, value: string): void => {
  bytes.set(new TextEncoder().encode(value), offset);
};

const toSeed = (text: string, voice: TtsVoiceSnapshot): Uint8Array =>
  createHash('sha256').update(JSON.stringify({ text, voice })).digest();

const createWav = (seed: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(wavHeaderBytes + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const dataBytes = bytes.byteLength - wavHeaderBytes;

  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < sampleCount; index += 1) {
    // hash byte를 작은 PCM amplitude로 바꿔 같은 입력의 짧은 파형을 고정한다.
    view.setInt16(
      wavHeaderBytes + index * 2,
      (seed[index % seed.byteLength]! - 128) * 128,
      true,
    );
  }

  return bytes;
};

const getFixtureFailure = (
  text: string,
): DeterministicTtsProviderError | null => {
  if (text.includes('[[timeout]]')) {
    return new DeterministicTtsProviderError('TTS_PROVIDER_TIMEOUT', true);
  }
  if (text.includes('[[retryable]]')) {
    return new DeterministicTtsProviderError('TTS_PROVIDER_RETRYABLE', true);
  }
  if (text.includes('[[terminal]]')) {
    return new DeterministicTtsProviderError('TTS_PROVIDER_TERMINAL', false);
  }
  return null;
};

/** 로컬과 단위 테스트에서 비용 없이 합성 흐름을 재현하는 TTS provider */
export class DeterministicTtsProvider implements TtsProvider {
  /** fixture 오류 또는 immutable 입력 기반 PCM WAV와 local metadata를 반환한다 */
  synthesize(
    input: Parameters<TtsProvider['synthesize']>[0],
  ): Promise<TtsProviderResult> {
    if (input.signal.aborted) {
      return Promise.reject(
        input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error('TTS 합성이 취소되었습니다'),
      );
    }

    const failure = getFixtureFailure(input.text);
    if (failure) return Promise.reject(failure);

    return Promise.resolve({
      bytes: createWav(toSeed(input.text, input.voice)),
      mimeType: 'audio/wav',
      usage: { inputCharacters: input.text.length, outputSamples: sampleCount },
      estimatedCostUsd: '0.000000',
      providerRequestId: 'local-deterministic-tts',
    });
  }
}
