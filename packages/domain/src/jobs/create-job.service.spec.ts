/** DB unique constraint와 queue 재시도를 함께 모델링하는 use case 테스트 */
import { describe, expect, it, vi } from 'vitest';
import { CreateJobService } from './create-job.service.js';

const command = {
  requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
  clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
  type: 'VOCAB_IMPORT' as const,
  inputs: [
    {
      uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
      inputType: 'TEXT' as const,
      inputKey: 'inputs/example.txt',
      sizeBytes: 128,
    },
  ],
};

const createFixture = () => {
  let job = {
    id: '405986f9-e552-4ce1-82d6-70a1fc460f96',
    ...command,
    status: 'QUEUED' as const,
    attempt: 0,
    enqueuedAt: null as Date | null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
  };
  const repository = {
    createOrFind: vi.fn(() => Promise.resolve({ job, created: false })),
    markEnqueued: vi.fn((_jobId: string, enqueuedAt: Date) => {
      job = { ...job, enqueuedAt };
      return Promise.resolve(job);
    }),
    findById: vi.fn(() => Promise.resolve(job)),
  };
  const queue = {
    send: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  return { repository, queue };
};

describe('CreateJobService', () => {
  it('같은 사용자와 clientRequestId 요청은 같은 Job을 반환하고 한 번만 전송한다', async () => {
    const { repository, queue } = createFixture();
    const service = new CreateJobService(
      repository,
      queue,
      () => new Date('2026-07-17T00:00:01.000Z'),
    );

    const first = await service.execute(command);
    const second = await service.execute(command);

    expect(second.id).toBe(first.id);
    expect(queue.send).toHaveBeenCalledTimes(1);
    expect(queue.send).toHaveBeenCalledWith({
      jobId: first.id,
      attempt: 0,
    });
  });

  it('queue 전송 실패 뒤에는 enqueuedAt을 남기지 않아 재시도할 수 있다', async () => {
    const { repository, queue } = createFixture();
    queue.send.mockRejectedValueOnce(new Error('queue unavailable'));
    const service = new CreateJobService(repository, queue);

    await expect(service.execute(command)).rejects.toThrow('queue unavailable');
    const retried = await service.execute(command);

    expect(retried.enqueuedAt).toBeInstanceOf(Date);
    expect(queue.send).toHaveBeenCalledTimes(2);
    expect(repository.markEnqueued).toHaveBeenCalledTimes(1);
  });
});
