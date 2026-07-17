/** 큰 입력을 queue에 복제하지 않고 Job 식별자만 보내는 adapter 테스트 */
import { describe, expect, it, vi } from 'vitest';
import { SqsJobQueue } from './sqs-job.queue.js';

describe('SqsJobQueue', () => {
  it('message body에는 jobId와 attempt만 직렬화한다', async () => {
    const send = vi.fn().mockResolvedValue({});
    const queue = new SqsJobQueue({ send } as never, 'queue-url');

    await queue.send({
      jobId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
      attempt: 2,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        QueueUrl: 'queue-url',
        MessageBody:
          '{"jobId":"405986f9-e552-4ce1-82d6-70a1fc460f96","attempt":2}',
      },
    });
  });
});
