/** unique constraint 충돌과 Job input transaction 경계를 고정하는 adapter 테스트 */
import { describe, expect, it, vi } from 'vitest';
import { jobs } from '../schema/index.js';
import { DrizzleJobRepository } from './drizzle-job.repository.js';

describe('DrizzleJobRepository', () => {
  it('Job insert는 요청자와 clientRequestId 충돌을 합치고 입력을 같은 transaction에 저장한다', async () => {
    const insertedId = '405986f9-e552-4ce1-82d6-70a1fc460f96';
    const onConflictDoNothing = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id: insertedId }]),
    }));
    const insertJobValues = vi.fn(() => ({ onConflictDoNothing }));
    const insertInputValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn((table: unknown) =>
      table === jobs
        ? { values: insertJobValues }
        : { values: insertInputValues },
    );
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: insertedId,
              requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
              clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
              type: 'VOCAB_IMPORT',
              status: 'QUEUED',
              attempt: 0,
              enqueuedAt: null,
              createdAt: new Date('2026-07-17T00:00:00.000Z'),
            },
          ]),
        })),
      })),
    }));
    const transaction = vi.fn((callback: (value: unknown) => unknown) =>
      callback({ insert, select }),
    );
    const repository = new DrizzleJobRepository({ transaction } as never);

    const result = await repository.createOrFind({
      requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      type: 'VOCAB_IMPORT',
      inputs: [
        {
          uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
          inputType: 'PDF',
          inputKey: 'inputs/owner/example.pdf',
          sizeBytes: 1024,
        },
      ],
    });

    expect(result.created).toBe(true);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(insertInputValues).toHaveBeenCalledWith([
      {
        jobId: insertedId,
        uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
      },
    ]);
  });
});
