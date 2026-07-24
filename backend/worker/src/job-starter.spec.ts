/** SQS 중복 전달이 같은 Step Functions execution 이름을 사용하게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { createJobStarterHandler } from './job-starter.js';

describe('createJobStarterHandler', () => {
  it('같은 Job attempt의 ExecutionAlreadyExists는 성공으로 처리한다', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ name: 'ExecutionAlreadyExists' });
    const handler = createJobStarterHandler(
      { send } as never,
      'state-machine-arn',
    );
    const body = JSON.stringify({
      jobId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
      attempt: 0,
    });

    await expect(
      handler({
        Records: [{ body }, { body }],
      } as never),
    ).resolves.toBeUndefined();
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        name: '405986f9-e552-4ce1-82d6-70a1fc460f96-0',
      },
    });
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      input: {
        name: '405986f9-e552-4ce1-82d6-70a1fc460f96-0',
      },
    });
  });
});
