/** TTS Lambda가 mode별 runtime을 cold start 한 번만 조립한다 */
import { createWorkerDatabase } from '../database-runtime.js';
import { createTtsRuntime } from './tts-runtime.js';

let defaultHandler:
  ReturnType<typeof createTtsRuntime>['taskHandler'] | undefined;

/** TTS queue message 하나를 canonical job 결과로 처리한다 */
export const handler = (message: unknown) => {
  defaultHandler ??= createTtsRuntime({
    database: createWorkerDatabase() as unknown as Parameters<
      typeof createTtsRuntime
    >[0]['database'],
    mode: process.env.DATABASE_MODE === 'local' ? 'local' : 'production',
  }).taskHandler;
  return defaultHandler(message);
};
