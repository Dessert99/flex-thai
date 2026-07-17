/** 영속 기술과 무관하게 Job 중복 생성과 queue 전달 상태를 표현한다 */
import type { CreateJobCommand, Job, JobStatus } from './job.js';

/** Job use case가 요구하는 최소 영속 기능 */
export interface JobRepository {
  createOrFind(
    command: CreateJobCommand,
  ): Promise<{ job: Job; created: boolean }>;
  markEnqueued(jobId: string, enqueuedAt: Date): Promise<Job>;
  findById(jobId: string): Promise<Job | null>;
  transitionStatus(jobId: string, from: JobStatus, to: JobStatus): Promise<Job>;
}
