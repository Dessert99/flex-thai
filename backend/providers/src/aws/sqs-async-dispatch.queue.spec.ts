/** shared outbox가 목적지별 SQS 수락 뒤에만 완료되는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { SqsAsyncDispatchQueue } from './sqs-async-dispatch.queue.js';

describe('SqsAsyncDispatchQueue', () => {
  it('설정된 목적지의 최소 payload와 delivery identity만 SQS에 보낸다', async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: 'accepted' });
    const queue = new SqsAsyncDispatchQueue(
      { send } as never,
      'https://sqs.example.com/content-production',
      'CONTENT_PRODUCTION',
    );

    await queue.accept({
      destination: 'CONTENT_PRODUCTION',
      messageId: 'content-production:00000000-0000-4000-8000-000000000001:2',
      payload: {
        jobId: '00000000-0000-4000-8000-000000000001',
        attempt: 2,
      },
    });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('다른 목적지 payload는 AWS 호출 전에 거절한다', async () => {
    const send = vi.fn();
    const queue = new SqsAsyncDispatchQueue(
      { send } as never,
      'https://sqs.example.com/content',
      'CONTENT_PRODUCTION',
    );

    await expect(
      queue.accept({
        destination: 'UNKNOWN' as never,
        messageId: 'content-production:id:0',
        payload: {
          jobId: '00000000-0000-4000-8000-000000000001',
          attempt: 0,
        },
      }),
    ).rejects.toThrow('ASYNC_DISPATCH_DESTINATION_MISMATCH');
    expect(send).not.toHaveBeenCalled();
  });
});
