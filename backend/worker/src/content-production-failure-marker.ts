/** 소진된 workflow의 현재 attempt를 DB terminal 실패로 닫는다 */
import { DrizzleContentProductionRepository } from '@flex-thia/database';
import type { ContentProductionRepository } from '@flex-thia/domain';
import { createWorkerDatabase } from './database-runtime.js';

/** failure marker가 요구하는 현재 attempt 조건부 저장소 */
export type ContentProductionFailureMarkerRepository = Pick<
  ContentProductionRepository,
  'failAttempt'
>;

/** 최신 attempt와 terminal 상태를 보존하며 failure marker handler를 만든다 */
export const createContentProductionFailureMarkerHandler =
  (repository: ContentProductionFailureMarkerRepository) =>
  async (input: {
    jobId: string;
    attempt: number;
  }): Promise<{ jobId: string; status: 'FAILED' | 'IGNORED' }> =>
    (await repository.failAttempt(
      input.jobId,
      input.attempt,
      'CONTENT_PRODUCTION_WORKFLOW_FAILURE',
    )) ?? { jobId: input.jobId, status: 'IGNORED' };

let defaultHandler:
  ReturnType<typeof createContentProductionFailureMarkerHandler> | undefined;

/** Lambda cold start마다 조건부 DB failure marker를 한 번 조립한다 */
export const handler = (input: { jobId: string; attempt: number }) => {
  defaultHandler ??= createContentProductionFailureMarkerHandler(
    new DrizzleContentProductionRepository(createWorkerDatabase()),
  );
  return defaultHandler(input);
};
