/** foundation worker가 허용된 Job 상태 전이만 수행하게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { createFoundationTaskHandler } from './foundation-task.js';

describe('createFoundationTaskHandler', () => {
  it('QUEUED Job을 RUNNING을 거쳐 COMPLETED로 바꾼다', async () => {
    const findById = vi.fn().mockResolvedValue({
      id: 'job-id',
      status: 'QUEUED',
    });
    const transitionStatus = vi
      .fn()
      .mockResolvedValueOnce({ id: 'job-id', status: 'RUNNING' })
      .mockResolvedValueOnce({ id: 'job-id', status: 'COMPLETED' });
    const handler = createFoundationTaskHandler({
      findById,
      transitionStatus,
    });

    await expect(handler({ jobId: 'job-id', attempt: 0 })).resolves.toEqual({
      jobId: 'job-id',
      status: 'COMPLETED',
    });
    expect(transitionStatus).toHaveBeenNthCalledWith(
      1,
      'job-id',
      'QUEUED',
      'RUNNING',
    );
    expect(transitionStatus).toHaveBeenNthCalledWith(
      2,
      'job-id',
      'RUNNING',
      'COMPLETED',
    );
  });

  it('이미 terminal 상태면 다시 실행하지 않는다', async () => {
    const transitionStatus = vi.fn();
    const handler = createFoundationTaskHandler({
      findById: vi.fn().mockResolvedValue({
        id: 'job-id',
        status: 'COMPLETED',
      }),
      transitionStatus,
    });

    await handler({ jobId: 'job-id', attempt: 0 });

    expect(transitionStatus).not.toHaveBeenCalled();
  });
});
