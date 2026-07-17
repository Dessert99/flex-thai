/** DB 없이 Job 중복 생성과 enqueue 상태를 검증하는 in-memory adapter */
import { randomUUID } from 'node:crypto';
import type { CreateJobCommand, Job, JobRepository } from '@flex-thia/domain';

/** 사용자와 요청 ID 복합 key로 idempotency를 재현하는 fake repository */
export class FakeJobRepository implements JobRepository {
  private readonly jobsById = new Map<string, Job>();
  private readonly jobIdByRequest = new Map<string, string>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** 같은 요청이면 기존 Job을, 처음이면 새 Job을 반환한다 */
  createOrFind(
    command: CreateJobCommand,
  ): Promise<{ job: Job; created: boolean }> {
    const requestKey = `${command.requestedBy}:${command.clientRequestId}`;
    const existingId = this.jobIdByRequest.get(requestKey);

    if (existingId) {
      const existing = this.jobsById.get(existingId);

      if (!existing) {
        throw new Error('FakeJobRepository 내부 인덱스가 일치하지 않습니다');
      }

      return Promise.resolve({ job: existing, created: false });
    }

    const job: Job = {
      id: randomUUID(),
      ...command,
      inputs: command.inputs.map((input) => ({ ...input })),
      status: 'QUEUED',
      attempt: 0,
      enqueuedAt: null,
      createdAt: this.now(),
    };
    this.jobsById.set(job.id, job);
    this.jobIdByRequest.set(requestKey, job.id);

    return Promise.resolve({ job, created: true });
  }

  /** queue 전송이 성공한 Job에만 enqueue 완료 시각을 남긴다 */
  markEnqueued(jobId: string, enqueuedAt: Date): Promise<Job> {
    const job = this.jobsById.get(jobId);

    if (!job) {
      throw new Error(`Job을 찾을 수 없습니다: ${jobId}`);
    }

    const updated = { ...job, enqueuedAt };
    this.jobsById.set(jobId, updated);
    return Promise.resolve(updated);
  }

  /** id로 현재 in-memory Job 상태를 조회한다 */
  findById(jobId: string): Promise<Job | null> {
    return Promise.resolve(this.jobsById.get(jobId) ?? null);
  }
}
