/** 로컬 outbox relay와 TTS audio GC를 한 signal-aware process에서 반복 실행한다 */
import { pathToFileURL } from 'node:url';
import { createWorkerDatabase } from './database-runtime.js';
import { createAsyncDispatchRelayRuntime } from './dispatch/async-dispatch-relay-task.js';
import { createTtsAudioGcTaskHandler } from './media/tts-audio-gc-task.js';
import { getDefaultTtsEntryRuntime } from './media/tts-entry-runtime.js';

type LocalWorkerTask = 'relay' | 'tts-audio-gc';

/** abort signal 또는 bounded poll interval 중 먼저 도착한 조건까지 대기한다 */
export type LocalWorkerWait = (
  signal: AbortSignal,
  durationMs: number,
) => Promise<void>;

/** 로컬 worker loop의 task, cadence, 오류 관찰 dependency */
export interface LocalWorkerInput {
  signal: AbortSignal;
  relay: () => Promise<unknown>;
  collectGarbage: () => Promise<unknown>;
  reportError: (task: LocalWorkerTask, error: unknown) => void;
  pollIntervalMs?: number;
  garbageCollectionIntervalMs?: number;
  now?: () => number;
  wait?: LocalWorkerWait;
}

const waitForPoll: LocalWorkerWait = (signal, durationMs) =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timeout = setTimeout(finish, durationMs);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });

const runTask = async (
  task: LocalWorkerTask,
  action: () => Promise<unknown>,
  reportError: LocalWorkerInput['reportError'],
): Promise<boolean> => {
  try {
    await action();
    return true;
  } catch (error) {
    reportError(task, error);
    return false;
  }
};

/** relay를 bounded poll하고 성공한 GC는 고정 interval 뒤 다시 실행한다 */
export const runLocalWorker = async (
  input: LocalWorkerInput,
): Promise<void> => {
  const pollIntervalMs = input.pollIntervalMs ?? 1_000;
  const garbageCollectionIntervalMs =
    input.garbageCollectionIntervalMs ?? 60 * 60 * 1_000;
  const now = input.now ?? Date.now;
  const wait = input.wait ?? waitForPoll;
  let nextGarbageCollectionAt = 0;

  while (!input.signal.aborted) {
    await runTask('relay', input.relay, input.reportError);

    if (now() >= nextGarbageCollectionAt) {
      const collected = await runTask(
        'tts-audio-gc',
        input.collectGarbage,
        input.reportError,
      );
      if (collected) {
        nextGarbageCollectionAt = now() + garbageCollectionIntervalMs;
      }
    }

    await wait(input.signal, pollIntervalMs);
  }
};

/** compose 전용 local runtime을 조립하고 SIGINT·SIGTERM에 맞춰 정상 종료한다 */
export const runDefaultLocalWorker = async (): Promise<void> => {
  if (process.env.DATABASE_MODE !== 'local') {
    throw new Error(
      'local worker는 DATABASE_MODE=local에서만 실행할 수 있습니다',
    );
  }

  const controller = new AbortController();
  const shutdown = () => controller.abort();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    const ttsRuntime = getDefaultTtsEntryRuntime();
    const relay = createAsyncDispatchRelayRuntime({
      database: createWorkerDatabase(),
      mode: 'local',
      localTtsHandler: ttsRuntime.taskHandler,
    });
    const collectGarbage = createTtsAudioGcTaskHandler(() => ttsRuntime);

    await runLocalWorker({
      signal: controller.signal,
      relay: () => relay.handler(),
      collectGarbage: () => collectGarbage(),
      reportError: (task, error) => {
        console.error(`local worker ${task} cycle failed`, error);
      },
    });
  } finally {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
  }
};

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  void runDefaultLocalWorker().catch((error: unknown) => {
    console.error('local worker startup failed', error);
    process.exitCode = 1;
  });
}
