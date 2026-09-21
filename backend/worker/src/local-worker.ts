import { runExtractionLoop } from './vocabulary-extraction/extraction-runtime.js';
import { pathToFileURL } from 'node:url';

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
    await runExtractionLoop(controller.signal);
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
