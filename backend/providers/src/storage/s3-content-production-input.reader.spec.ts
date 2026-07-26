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

describe('S3ContentProductionInputReader', () => {
  it('snapshot의 exact key object를 읽는다', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: {
        transformToByteArray: () => Promise.resolve(Uint8Array.from([1, 2, 3])),
      },
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
      Body: {
        transformToByteArray: () => Promise.resolve(Uint8Array.from([1, 2])),
      },
    });
    const reader = new S3ContentProductionInputReader(
      { send } as never,
      'input-bucket',
    );

    await expect(
      reader.read(input, new AbortController().signal),
    ).rejects.toThrow('CONTENT_INPUT_SIZE_MISMATCH');
  });
});
