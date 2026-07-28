/** TTS processor·READY guard·GC를 동일 durability와 mode별 adapter로 조립한다 */
import {
  DrizzleTtsDurabilityRepository,
  DrizzleTtsRepository,
  DrizzleTtsTargetAttachmentWriter,
} from '@flex-thia/database';
import type {
  TtsAudioGarbageStore,
  TtsAudioStore,
  TtsJobStatus,
  TtsProvider,
} from '@flex-thia/domain';
import {
  DeterministicTtsProvider,
  FakeTtsAudioStore,
  LocalFileTtsAudioStore,
  resolveLocalTtsAudioDirectory,
  UnavailableTtsAudioStore,
} from '@flex-thia/providers';
import { TtsAudioGarbageCollector } from './tts-audio-gc.js';
import { TtsProcessor, UnavailableTtsProvider } from './tts-processor.js';
import { createTtsTaskHandler, type TtsTaskProcessor } from './tts-task.js';

/** TTS 외부 호출과 object side effect를 결정하는 실행 mode */
export type TtsRuntimeMode = 'local' | 'test' | 'production';

const isTerminal = (status: TtsJobStatus): boolean =>
  status === 'SUCCEEDED' ||
  status === 'PARTIALLY_FAILED' ||
  status === 'FAILED';

/** 기존 worker 공개 경계에서 shared local directory resolver를 유지한다 */
export { resolveLocalTtsAudioDirectory };

/** 동일 DB·durability·storage identity를 TTS task와 GC task에 제공한다 */
export const createTtsRuntime = (input: {
  database: ConstructorParameters<typeof DrizzleTtsRepository>[0];
  mode: TtsRuntimeMode;
  now?: () => Date;
  localAudioDirectory?: string;
  audioStore?: TtsAudioStore & TtsAudioGarbageStore;
}) => {
  const now = input.now ?? (() => new Date());
  const durability = new DrizzleTtsDurabilityRepository(input.database, now);
  const targetAttachments = new DrizzleTtsTargetAttachmentWriter();
  const repository = new DrizzleTtsRepository(
    input.database,
    targetAttachments,
    now,
    durability,
  );
  const provider: TtsProvider =
    input.mode === 'production'
      ? new UnavailableTtsProvider()
      : new DeterministicTtsProvider();
  const audioStore: TtsAudioStore & TtsAudioGarbageStore =
    input.audioStore ??
    (input.mode === 'production'
      ? new UnavailableTtsAudioStore()
      : input.mode === 'local'
        ? new LocalFileTtsAudioStore(
            input.localAudioDirectory ?? resolveLocalTtsAudioDirectory(),
          )
        : new FakeTtsAudioStore());
  const processor = new TtsProcessor(
    repository,
    provider,
    audioStore,
    now,
    undefined,
    durability,
  );
  const dispatchProcessor: TtsTaskProcessor = {
    async processDispatch(dispatch) {
      const before = await repository.getDispatchState(dispatch.jobId);
      if (!before) return { kind: 'IGNORED', status: 'JOB_NOT_FOUND' };
      if (before.dispatchAttempt !== dispatch.dispatchAttempt) {
        return { kind: 'IGNORED', status: 'STALE_DISPATCH' };
      }
      if (isTerminal(before.status)) {
        return { kind: 'IGNORED', status: before.status };
      }
      const status = await processor.process(
        dispatch.jobId,
        dispatch.signal,
        dispatch.dispatchAttempt,
      );
      return { kind: 'PROCESSED', status };
    },
  };
  const collector = new TtsAudioGarbageCollector(durability, audioStore, now);

  return {
    mode: input.mode,
    durability,
    targetAttachments,
    repository,
    provider,
    audioStore,
    garbageStore: audioStore,
    processor,
    collector,
    taskHandler: createTtsTaskHandler(repository, dispatchProcessor),
  };
};
