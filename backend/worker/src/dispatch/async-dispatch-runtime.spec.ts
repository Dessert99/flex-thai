/** shared relay runtime의 local 직접 실행과 queue acceptance 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  AcceptedQueueDispatchSender,
  UnavailableAsyncDispatchSender,
  createLocalAsyncDispatchSenders,
} from './async-dispatch-runtime.js';

const jobId = '00000000-0000-4000-8000-000000000001';

describe('async dispatch sender runtime', () => {
  it('local sender는 CONTENT_PRODUCTION과 TTS handler를 서로 바꾸지 않고 직접 기다린다', async () => {
    const events: string[] = [];
    const senders = createLocalAsyncDispatchSenders({
      contentProductionHandler: vi.fn(() => {
        events.push('content');
        return Promise.resolve({ jobId, status: 'COMPLETED' as const });
      }),
      ttsHandler: vi.fn(() => {
        events.push('tts');
        return Promise.resolve({
          kind: 'PROCESSED' as const,
          jobId,
          status: 'SUCCEEDED' as const,
        });
      }),
    });

    await senders.CONTENT_PRODUCTION.send({
      messageId: `content-production:${jobId}:0`,
      payload: { jobId, attempt: 0 },
    });
    await senders.TTS.send({
      messageId: `tts:${jobId}:0`,
      payload: { jobId, attempt: 0 },
    });

    expect(events).toEqual(['content', 'tts']);
  });

  it('production queue sender는 queue acceptance promise가 끝난 뒤에만 resolve한다', async () => {
    let accept!: () => void;
    const acceptance = new Promise<void>((resolve) => {
      accept = resolve;
    });
    const queue = {
      accept: vi.fn(() => acceptance),
    };
    const sender = new AcceptedQueueDispatchSender(queue, 'TTS');
    let settled = false;

    const sending = sender
      .send({
        messageId: `tts:${jobId}:1`,
        payload: { jobId, attempt: 1 },
      })
      .then(() => {
        settled = true;
      });
    await Promise.resolve();

    expect(settled).toBe(false);
    accept();
    await sending;
    expect(queue.accept).toHaveBeenCalledWith({
      destination: 'TTS',
      messageId: `tts:${jobId}:1`,
      payload: { jobId, attempt: 1 },
    });
  });

  it('queue가 미구성된 production sender는 ack 가능한 성공을 만들지 않는다', async () => {
    await expect(
      new UnavailableAsyncDispatchSender().send({
        messageId: `tts:${jobId}:0`,
        payload: { jobId, attempt: 0 },
      }),
    ).rejects.toThrow('ASYNC_DISPATCH_QUEUE_UNAVAILABLE');
  });
});
