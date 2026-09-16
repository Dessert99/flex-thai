/** shared relay runtime의 local 직접 실행과 queue acceptance 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  AcceptedQueueDispatchSender,
  UnavailableAsyncDispatchSender,
} from './async-dispatch-runtime.js';

const jobId = '00000000-0000-4000-8000-000000000001';

describe('async dispatch sender runtime', () => {
  it('production queue sender는 queue acceptance promise가 끝난 뒤에만 resolve한다', async () => {
    let accept!: () => void;
    const acceptance = new Promise<void>((resolve) => {
      accept = resolve;
    });
    const queue = {
      accept: vi.fn(() => acceptance),
    };
    const sender = new AcceptedQueueDispatchSender(queue, 'CONTENT_PRODUCTION');
    let settled = false;

    const sending = sender
      .send({
        messageId: `content-production:${jobId}:1`,
        payload: { jobId, attempt: 1 },
      })
      .then(() => {
        settled = true;
      });
    await Promise.resolve();

    expect(settled).toBe(false);
    accept();
    await sending;
  });

  it('queue가 미구성된 production sender는 ack 가능한 성공을 만들지 않는다', async () => {
    await expect(
      new UnavailableAsyncDispatchSender().send({
        messageId: `content-production:${jobId}:0`,
        payload: { jobId, attempt: 0 },
      }),
    ).rejects.toThrow('ASYNC_DISPATCH_QUEUE_UNAVAILABLE');
  });
});
