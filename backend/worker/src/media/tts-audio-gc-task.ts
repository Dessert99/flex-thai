/** TTS audio GC Lambda가 reference-safe DB claim 뒤 object cleanup을 실행한다 */
import { createWorkerDatabase } from '../database-runtime.js';
import { createTtsRuntime } from './tts-runtime.js';

/** schedule payload 없이도 제한된 GC batch 기본값을 제공한다 */
export interface TtsAudioGcTaskInput {
  workerId?: string;
  batchSize?: number;
  leaseDurationMs?: number;
  retryDelayMs?: number;
}

let defaultCollector:
  ReturnType<typeof createTtsRuntime>['collector'] | undefined;

/** production storage 미구성 시 delete하지 않고 DB lease를 release한다 */
export const handler = (input: TtsAudioGcTaskInput = {}) => {
  defaultCollector ??= createTtsRuntime({
    database: createWorkerDatabase() as unknown as Parameters<
      typeof createTtsRuntime
    >[0]['database'],
    mode: process.env.DATABASE_MODE === 'local' ? 'local' : 'production',
  }).collector;
  return defaultCollector.processBatch({
    workerId:
      input.workerId ??
      process.env.AWS_LAMBDA_LOG_STREAM_NAME ??
      'tts-audio-gc-worker',
    batchSize: input.batchSize ?? 20,
    leaseDurationMs: input.leaseDurationMs ?? 60_000,
    retryDelayMs: input.retryDelayMs ?? 30_000,
  });
};
