/** HTTP 요청을 idempotent Job과 queue message로 바꾼다 */
import type { CreateJobCommand, Job } from './job.js';
import type { JobQueue } from './job.queue.js';
import type { JobRepository } from './job.repository.js';

/** DB 중복 방지와 queue 재시도를 조율하는 Job 생성 use case */
export class CreateJobService {
  constructor(
    private readonly repository: JobRepository,
    private readonly queue: JobQueue,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** queue 전송 성공 뒤에만 enqueuedAt을 남겨 실패한 요청은 재시도한다 */
  async execute(command: CreateJobCommand): Promise<Job> {
    const { job } = await this.repository.createOrFind(command);

    if (job.enqueuedAt) {
      return job;
    }

    await this.queue.send({ jobId: job.id, attempt: job.attempt });
    return this.repository.markEnqueued(job.id, this.now());
  }
}
