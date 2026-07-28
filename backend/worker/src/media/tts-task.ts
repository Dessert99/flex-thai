/** TTS queue payload를 현재 dispatch 세대 하나의 processor 실행으로 제한한다 */
import type { TtsJobStatus } from '@flex-thia/domain';

/** TTS queue payload와 DB job dispatch identity를 대조하는 읽기 port */
export interface TtsDispatchStateRepository {
  getDispatchState(jobId: string): Promise<{
    dispatchAttempt: number;
    status: TtsJobStatus;
  } | null>;
}

/** dispatch 세대가 바뀌어도 새 item을 claim하지 않는 TTS processor port */
export interface TtsTaskProcessor {
  processDispatch(input: {
    jobId: string;
    dispatchAttempt: number;
    signal: AbortSignal;
  }): Promise<
    | { kind: 'PROCESSED' | 'IGNORED'; status: TtsJobStatus }
    | { kind: 'IGNORED'; status: 'STALE_DISPATCH' | 'JOB_NOT_FOUND' }
  >;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const parseMessage = (
  value: unknown,
): { jobId: string; attempt: number } | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'attempt,jobId' ||
    typeof record['jobId'] !== 'string' ||
    !uuidPattern.test(record['jobId']) ||
    !Number.isSafeInteger(record['attempt']) ||
    typeof record['attempt'] !== 'number' ||
    record['attempt'] < 0
  ) {
    return null;
  }
  return { jobId: record['jobId'], attempt: record['attempt'] };
};

/** malformed는 terminal 결과로, stale·duplicate는 무해한 canonical 결과로 닫는다 */
export const createTtsTaskHandler =
  (repository: TtsDispatchStateRepository, processor: TtsTaskProcessor) =>
  async (message: unknown) => {
    const parsed = parseMessage(message);
    if (!parsed) {
      return {
        kind: 'MALFORMED' as const,
        errorCode: 'TTS_DISPATCH_MESSAGE_INVALID' as const,
      };
    }
    const state = await repository.getDispatchState(parsed.jobId);
    if (!state) {
      return {
        kind: 'IGNORED' as const,
        jobId: parsed.jobId,
        status: 'JOB_NOT_FOUND' as const,
      };
    }
    if (state.dispatchAttempt !== parsed.attempt) {
      return {
        kind: 'IGNORED' as const,
        jobId: parsed.jobId,
        status: 'STALE_DISPATCH' as const,
      };
    }

    const result = await processor.processDispatch({
      jobId: parsed.jobId,
      dispatchAttempt: parsed.attempt,
      signal: new AbortController().signal,
    });
    return { ...result, jobId: parsed.jobId };
  };
