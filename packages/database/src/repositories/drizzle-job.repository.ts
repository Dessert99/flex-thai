/** Drizzle transaction과 unique constraint로 Job repository port를 구현한다 */
import { and, eq, isNull } from 'drizzle-orm';
import type { CreateJobCommand, Job, JobRepository } from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { jobInputs, jobs, uploads } from '../schema/index.js';
import * as schema from '../schema/index.js';

type JobDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type JobRow = typeof jobs.$inferSelect;

const toJob = (row: JobRow, inputs: CreateJobCommand['inputs']): Job => ({
  id: row.id,
  requestedBy: row.requestedBy,
  clientRequestId: row.clientRequestId,
  type: row.type,
  inputs,
  status: row.status,
  attempt: row.attempt,
  enqueuedAt: row.enqueuedAt,
  createdAt: row.createdAt,
});

/** PostgreSQL과 Aurora Data API가 공유하는 Drizzle Job adapter */
export class DrizzleJobRepository implements JobRepository {
  constructor(private readonly database: JobDatabase) {}

  /** unique 충돌은 기존 Job으로 합치고 새 입력은 같은 transaction에 저장한다 */
  async createOrFind(
    command: CreateJobCommand,
  ): Promise<{ job: Job; created: boolean }> {
    return this.database.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(jobs)
        .values({
          requestedBy: command.requestedBy,
          clientRequestId: command.clientRequestId,
          type: command.type,
        })
        .onConflictDoNothing({
          target: [jobs.requestedBy, jobs.clientRequestId],
        })
        .returning({ id: jobs.id });
      const [row] = await transaction
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.requestedBy, command.requestedBy),
            eq(jobs.clientRequestId, command.clientRequestId),
          ),
        )
        .limit(1);

      if (!row) {
        throw new Error('Job insert 또는 조회 결과가 없습니다');
      }

      const created = inserted.length > 0;

      if (created) {
        await transaction.insert(jobInputs).values(
          command.inputs.map((input) => ({
            jobId: row.id,
            uploadId: input.uploadId,
          })),
        );
        return { job: toJob(row, command.inputs), created };
      }

      const persistedInputs = await transaction
        .select({
          uploadId: uploads.id,
          inputType: uploads.inputType,
          inputKey: uploads.objectKey,
          sizeBytes: uploads.sizeBytes,
        })
        .from(jobInputs)
        .innerJoin(uploads, eq(jobInputs.uploadId, uploads.id))
        .where(eq(jobInputs.jobId, row.id));
      const inputs = persistedInputs.map((input) => {
        if (input.sizeBytes === null) {
          throw new Error(`검증되지 않은 upload입니다: ${input.uploadId}`);
        }

        return {
          ...input,
          sizeBytes: input.sizeBytes,
        };
      });

      return { job: toJob(row, inputs), created };
    });
  }

  /** 첫 queue 전송 성공만 기록하고 동시 재시도는 기존 상태를 반환한다 */
  async markEnqueued(jobId: string, enqueuedAt: Date): Promise<Job> {
    await this.database
      .update(jobs)
      .set({ enqueuedAt })
      .where(and(eq(jobs.id, jobId), isNull(jobs.enqueuedAt)));
    const job = await this.findById(jobId);

    if (!job) {
      throw new Error(`Job을 찾을 수 없습니다: ${jobId}`);
    }

    return job;
  }

  /** Job과 저장된 upload 입력을 함께 조회한다 */
  async findById(jobId: string): Promise<Job | null> {
    const [row] = await this.database
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!row) {
      return null;
    }

    const persistedInputs = await this.database
      .select({
        uploadId: uploads.id,
        inputType: uploads.inputType,
        inputKey: uploads.objectKey,
        sizeBytes: uploads.sizeBytes,
      })
      .from(jobInputs)
      .innerJoin(uploads, eq(jobInputs.uploadId, uploads.id))
      .where(eq(jobInputs.jobId, jobId));
    const inputs = persistedInputs.map((input) => {
      if (input.sizeBytes === null) {
        throw new Error(`검증되지 않은 upload입니다: ${input.uploadId}`);
      }

      return {
        ...input,
        sizeBytes: input.sizeBytes,
      };
    });

    return toJob(row, inputs);
  }
}
