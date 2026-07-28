/** TTS Lambda entry용 runtime을 cold-start당 한 번 조립한다 */
import {
  createS3TtsAudioStore,
  type CreateS3TtsAudioStoreInput,
} from '@flex-thia/providers';
import type { TtsAudioGarbageStore, TtsAudioStore } from '@flex-thia/domain';
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

const requireRuntimeEnv = (
  source: Record<string, string | undefined>,
  key: string,
): string => {
  const value = source[key];
  if (!value) throw new Error(`${key} 환경 변수가 필요합니다`);
  return value;
};

/** production TTS entry의 region과 private bucket을 S3 store에 고정한다 */
export const createProductionTtsAudioStore = (
  source: Record<string, string | undefined>,
  createStore: (
    input: CreateS3TtsAudioStoreInput,
  ) => TtsAudioStore & TtsAudioGarbageStore = createS3TtsAudioStore,
) =>
  createStore({
    region: requireRuntimeEnv(source, 'AWS_REGION'),
    bucketName: requireRuntimeEnv(source, 'MEDIA_BUCKET_NAME'),
  });

const defaultProvider = createTtsEntryRuntimeProvider(() => {
  const mode = process.env.DATABASE_MODE === 'local' ? 'local' : 'production';
  return createTtsRuntime({
    database: createWorkerDatabase() as unknown as Parameters<
      typeof createTtsRuntime
    >[0]['database'],
    mode,
    ...(mode === 'production'
      ? { audioStore: createProductionTtsAudioStore(process.env) }
      : {}),
  });
});

/** 한 Lambda process 안에서 default runtime을 cold-start 한 번만 생성한다 */
export const getDefaultTtsEntryRuntime = () => defaultProvider.get();
