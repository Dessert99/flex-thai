/** S3 콘텐츠 입력 reader가 exact key와 검증 size를 지키는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { S3ContentProductionInputReader } from './s3-content-production-input.reader.js';

const input = {
  jobInputId: 'input-id',
  ordinal: 0,
  uploadId: 'upload-id',
  inputType: 'TEXT' as const,
  inputKey: 'private/input.txt',
  sizeBytes: 3,
};

const bodyFrom = (...chunks: number[][]) => ({
  async *[Symbol.asyncIterator]() {
    await Promise.resolve();
    for (const chunk of chunks) {
      yield Uint8Array.from(chunk);
    }
  },
});

describe('S3ContentProductionInputReader', () => {
  it('snapshot의 exact key object를 읽는다', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: bodyFrom([1, 2], [3]),
    });
    const reader = new S3ContentProductionInputReader(
      { send } as never,
      'input-bucket',
    );

    await expect(
      reader.read(input, new AbortController().signal),
    ).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    const command = send.mock.calls[0]?.[0] as unknown as {
      input: { Bucket: string; Key: string };
    };
    expect(command.input).toEqual({
      Bucket: 'input-bucket',
      Key: 'private/input.txt',
    });
  });

  it('검증된 size와 다른 object를 거절한다', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: bodyFrom([1, 2]),
    });
    const reader = new S3ContentProductionInputReader(
      { send } as never,
      'input-bucket',
    );

    await expect(
      reader.read(input, new AbortController().signal),
    ).rejects.toThrow('CONTENT_INPUT_SIZE_MISMATCH');
  });

  it('expected size를 넘는 즉시 stream을 중단하고 후속 chunk를 읽지 않는다', async () => {
    let yielded = 0;
    const destroy = vi.fn();
    const body = {
      destroy,
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yielded += 1;
        yield Uint8Array.from([1, 2]);
        yielded += 1;
        yield Uint8Array.from([3, 4]);
        yielded += 1;
        yield Uint8Array.from([5]);
      },
    };
    const send = vi.fn().mockResolvedValue({ Body: body });
    const reader = new S3ContentProductionInputReader(
      { send } as never,
      'input-bucket',
    );

    await expect(
      reader.read(input, new AbortController().signal),
    ).rejects.toThrow('CONTENT_INPUT_SIZE_MISMATCH');
    expect(yielded).toBe(2);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('취소된 signal은 stream을 중단한다', async () => {
    const destroy = vi.fn();
    const send = vi.fn().mockResolvedValue({
      Body: { ...bodyFrom([1, 2, 3]), destroy },
    });
    const reader = new S3ContentProductionInputReader(
      { send } as never,
      'input-bucket',
    );
    const controller = new AbortController();
    controller.abort(new Error('사용자 취소'));

    await expect(reader.read(input, controller.signal)).rejects.toThrow(
      '사용자 취소',
    );
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('stream 오류를 숨기지 않는다', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: {
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield Uint8Array.from([1]);
          throw new Error('S3_STREAM_FAILED');
        },
      },
    });
    const reader = new S3ContentProductionInputReader(
      { send } as never,
      'input-bucket',
    );

    await expect(
      reader.read(input, new AbortController().signal),
    ).rejects.toThrow('S3_STREAM_FAILED');
  });
});
