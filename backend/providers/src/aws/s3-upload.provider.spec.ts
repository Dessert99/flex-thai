/** presigned POST가 key·content type·25MB 상한을 직접 강제하게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { S3UploadProvider } from './s3-upload.provider.js';

describe('S3UploadProvider', () => {
  it('10분 policy에 exact key와 content-length-range를 넣는다', async () => {
    const sign = vi.fn().mockResolvedValue({
      url: 'https://bucket.s3.amazonaws.com',
      fields: { key: 'inputs/user/upload' },
    });
    const provider = new S3UploadProvider(
      {} as never,
      'input-bucket',
      sign,
      () => new Date('2026-07-17T00:00:00.000Z'),
    );

    const policy = await provider.createPolicy({
      uploadId: 'upload-id',
      objectKey: 'inputs/user/upload',
      contentType: 'application/pdf',
    });

    const options: unknown = sign.mock.calls[0]?.[1];

    expect(options).toMatchObject({
      Bucket: 'input-bucket',
      Key: 'inputs/user/upload',
      Expires: 600,
    });
    expect((options as { Conditions?: unknown }).Conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 25 * 1024 * 1024],
        ['eq', '$key', 'inputs/user/upload'],
      ]),
    );
    expect(policy.expiresAt).toBe('2026-07-17T00:10:00.000Z');
  });
});
