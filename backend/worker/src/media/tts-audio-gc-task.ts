/** TTS audio GC Lambda가 reference-safe DB claim 뒤 object cleanup을 실행한다 */
import { getDefaultTtsEntryRuntime } from './tts-entry-runtime.js';
import type { createTtsRuntime } from './tts-runtime.js';

/** schedule payload 없이도 제한된 GC batch 기본값을 제공한다 */
export interface TtsAudioGcTaskInput {
  workerId?: string;
  batchSize?: number;
  leaseDurationMs?: number;
  retryDelayMs?: number;
}

type TtsGcRuntime = Pick<ReturnType<typeof createTtsRuntime>, 'collector'>;

/** production storage 미구성 시 delete하지 않고 DB lease를 release한다 */
export const createTtsAudioGcTaskHandler =
  (getRuntime: () => TtsGcRuntime) =>
  (input: TtsAudioGcTaskInput = {}) =>
    getRuntime().collector.processBatch({
      workerId:
        input.workerId ??
        process.env.AWS_LAMBDA_LOG_STREAM_NAME ??
        'tts-audio-gc-worker',
      batchSize: input.batchSize ?? 20,
      leaseDurationMs: input.leaseDurationMs ?? 60_000,
      retryDelayMs: input.retryDelayMs ?? 30_000,
    });

/** schedule batch를 shared cold-start runtime의 GC collector로 처리한다 */
export const handler = createTtsAudioGcTaskHandler(getDefaultTtsEntryRuntime);
