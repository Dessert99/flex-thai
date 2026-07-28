/** TTS Lambda entry용 runtime을 cold-start당 한 번 조립한다 */
import { createWorkerDatabase } from '../database-runtime.js';
import { createTtsRuntime } from './tts-runtime.js';

/** 서로 다른 entry handler가 공유하는 lazy runtime 접근자 */
export interface TtsEntryRuntimeProvider<Runtime> {
  get(): Runtime;
}

/** entry별 중복 생성을 막고 첫 runtime identity를 이후 호출에 재사용한다 */
export const createTtsEntryRuntimeProvider = <Runtime>(
  createRuntime: () => Runtime,
): TtsEntryRuntimeProvider<Runtime> => {
  let runtime: Runtime | undefined;
  return {
    get() {
      runtime ??= createRuntime();
      return runtime;
    },
  };
};

const defaultProvider = createTtsEntryRuntimeProvider(() =>
  createTtsRuntime({
    database: createWorkerDatabase() as unknown as Parameters<
      typeof createTtsRuntime
    >[0]['database'],
    mode: process.env.DATABASE_MODE === 'local' ? 'local' : 'production',
  }),
);

/** 한 Lambda process 안에서 default runtime을 cold-start 한 번만 생성한다 */
export const getDefaultTtsEntryRuntime = () => defaultProvider.get();
