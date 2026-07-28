/** TTS SQS entry가 record body와 부분 batch 실패를 정확히 변환하는지 검증한다 */
import type { SQSEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createTtsSqsHandler } from './tts-task-entry.js';

const record = (messageId: string, body: string) =>
  ({
    messageId,
    body,
  }) as SQSEvent['Records'][number];

describe('TTS SQS entry', () => {
  it('유효한 record body만 JSON으로 풀어 direct handler에 전달한다', async () => {
    const directHandler = vi.fn().mockResolvedValue({
      kind: 'PROCESSED',
      status: 'SUCCEEDED',
    });
    const handler = createTtsSqsHandler(() => directHandler);
    const event = {
      Records: [
        record(
          'message-1',
          '{"jobId":"00000000-0000-4000-8000-000000000001","attempt":2}',
        ),
      ],
    } as SQSEvent;

    await expect(handler(event)).resolves.toEqual({ batchItemFailures: [] });
    expect(directHandler).toHaveBeenCalledWith({
      jobId: '00000000-0000-4000-8000-000000000001',
      attempt: 2,
    });
  });

  it('JSON이 아닌 body는 terminal malformed로 ACK하고 direct handler를 호출하지 않는다', async () => {
    const directHandler = vi.fn();
    const handler = createTtsSqsHandler(() => directHandler);

    await expect(
      handler({ Records: [record('message-1', '{broken')] } as SQSEvent),
    ).resolves.toEqual({ batchItemFailures: [] });
    expect(directHandler).not.toHaveBeenCalled();
  });

  it('실패 record만 재전달하고 같은 batch의 정상 record는 계속 처리한다', async () => {
    const directHandler = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ kind: 'IGNORED', status: 'STALE_DISPATCH' });
    const handler = createTtsSqsHandler(() => directHandler);

    await expect(
      handler({
        Records: [
          record(
            'message-1',
            '{"jobId":"00000000-0000-4000-8000-000000000001","attempt":0}',
          ),
          record(
            'message-2',
            '{"jobId":"00000000-0000-4000-8000-000000000002","attempt":1}',
          ),
        ],
      } as SQSEvent),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-1' }],
    });
    expect(directHandler).toHaveBeenCalledTimes(2);
  });
});
