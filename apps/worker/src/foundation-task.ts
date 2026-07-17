/** 기초 workflow가 실제 AI 호출 없이 Job 상태 수직 흐름만 검증한다 */
import type { Job, JobStatus } from '@flex-thia/domain';
import { DrizzleJobRepository } from '@flex-thia/database';
import { createWorkerDatabase } from './database-runtime.js';

/** foundation task가 요구하는 Job 조회와 조건부 상태 전이 */
export interface FoundationJobRepository {
  findById(jobId: string): Promise<Job | null>;
  transitionStatus(jobId: string, from: JobStatus, to: JobStatus): Promise<Job>;
}

const TERMINAL_STATUSES: JobStatus[] = [
  'COMPLETED',
  'COMPLETED_WITH_FAILURES',
  'FAILED',
  'CANCELLED',
];

/** QUEUED 또는 재시도된 RUNNING Job만 foundation 완료 상태로 전이한다 */
export const createFoundationTaskHandler =
  (repository: FoundationJobRepository) =>
  async (input: {
    jobId: string;
    attempt: number;
  }): Promise<{ jobId: string; status: JobStatus }> => {
    const job = await repository.findById(input.jobId);

    if (!job) {
      throw new Error(`Job을 찾을 수 없습니다: ${input.jobId}`);
    }

    if (TERMINAL_STATUSES.includes(job.status)) {
      return { jobId: job.id, status: job.status };
    }

    if (job.status === 'QUEUED') {
      await repository.transitionStatus(job.id, 'QUEUED', 'RUNNING');
    } else if (job.status !== 'RUNNING') {
      throw new Error(`허용되지 않은 Job 상태입니다: ${job.status}`);
    }

    const completed = await repository.transitionStatus(
      job.id,
      'RUNNING',
      'COMPLETED',
    );
    return { jobId: completed.id, status: completed.status };
  };

let defaultHandler: ReturnType<typeof createFoundationTaskHandler> | undefined;

/** Lambda invocation에서 DB repository를 한 번 만들고 foundation 흐름을 실행한다 */
export const handler = (input: {
  jobId: string;
  attempt: number;
}): Promise<{ jobId: string; status: JobStatus }> => {
  defaultHandler ??= createFoundationTaskHandler(
    new DrizzleJobRepository(createWorkerDatabase()),
  );
  return defaultHandler(input);
};
