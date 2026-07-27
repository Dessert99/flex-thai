/** 외부 TTS 없이 결정적인 PCM WAV와 오류 fixture를 검증한다 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TtsVoiceSnapshot } from '../../../domain/src/media/tts-job.js';
import {
  DeterministicTtsProvider,
  DeterministicTtsProviderError,
} from './deterministic-tts.provider.js';

const voice: TtsVoiceSnapshot = {
  presetId: 'thai-standard',
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  voice: 'th-TH-standard-a',
  locale: 'th-TH',
  audioFormat: 'audio/wav',
  generationRevision: '2026-07-27',
};

const synthesize = (text: string, voiceSnapshot = voice) =>
  new DeterministicTtsProvider().synthesize({
    text,
    voice: voiceSnapshot,
    signal: new AbortController().signal,
  });

describe('DeterministicTtsProvider PCM WAV 합성', () => {
  it('표준 RIFF/WAVE PCM header와 고정 local metadata를 반환한다', async () => {
    const result = await synthesize('สวัสดี');
    const header = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );

    expect(new TextDecoder().decode(result.bytes.subarray(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(result.bytes.subarray(8, 12))).toBe('WAVE');
    expect(new TextDecoder().decode(result.bytes.subarray(12, 16))).toBe(
      'fmt ',
    );
    expect(header.getUint16(20, true)).toBe(1);
    expect(header.getUint16(22, true)).toBe(1);
    expect(header.getUint32(24, true)).toBe(8_000);
    expect(header.getUint16(34, true)).toBe(16);
    expect(new TextDecoder().decode(result.bytes.subarray(36, 40))).toBe(
      'data',
    );
    expect(header.getUint32(40, true)).toBe(result.bytes.byteLength - 44);
    expect(result).toMatchObject({
      mimeType: 'audio/wav',
      usage: { inputCharacters: 6, outputSamples: 80 },
      estimatedCostUsd: '0.000000',
      providerRequestId: 'local-deterministic-tts',
    });
  });

  it('같은 text와 voice는 같은 audio digest를, 다른 voice는 다른 digest를 만든다', async () => {
    const first = await synthesize('สวัสดี');
    const second = await synthesize('สวัสดี');
    const differentVoice = await synthesize('สวัสดี', {
      ...voice,
      voice: 'th-TH-standard-b',
    });
    const digest = (bytes: Uint8Array) =>
      createHash('sha256').update(bytes).digest('hex');

    expect(digest(second.bytes)).toBe(digest(first.bytes));
    expect(digest(differentVoice.bytes)).not.toBe(digest(first.bytes));
  });
});

describe('DeterministicTtsProvider 오류 fixture', () => {
  it.each([
    ['[[timeout]]', 'TTS_PROVIDER_TIMEOUT', true],
    ['[[retryable]]', 'TTS_PROVIDER_RETRYABLE', true],
    ['[[terminal]]', 'TTS_PROVIDER_TERMINAL', false],
  ] as const)(
    '%s text는 stable 오류를 반환한다',
    async (text, code, retryable) => {
      await expect(synthesize(text)).rejects.toMatchObject({
        name: 'DeterministicTtsProviderError',
        code,
        retryable,
      } satisfies Partial<DeterministicTtsProviderError>);
    },
  );
});
