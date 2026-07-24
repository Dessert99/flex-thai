/** audio S3 adapter의 exact policy·bytes hash·오류 은닉을 고정한다 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AudioUploadStorageError } from '@flex-thia/domain';
import { S3AudioUploadProvider } from './audio-upload.provider.js';

describe('S3AudioUploadProvider', () => {
  it('10분 policy에 exact key·MIME·size와 전체 허용 범위를 강제한다', async () => {
    const sign = vi.fn().mockResolvedValue({
      url: 'https://media-bucket.s3.amazonaws.com',
      fields: { key: 'audio/media-id', 'Content-Type': 'audio/mpeg' },
    });
    const provider = new S3AudioUploadProvider(
      {} as never,
      'media-bucket',
      sign,
      () => new Date('2026-07-24T00:00:00.000Z'),
    );

    const result = await provider.createUpload({
      mediaAssetId: 'media-id',
      storageKey: 'audio/media-id',
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
    });
    const options = sign.mock.calls[0]?.[1] as {
      Bucket: string;
      Key: string;
      Expires: number;
      Conditions: unknown[];
    };

    expect(options).toMatchObject({
      Bucket: 'media-bucket',
      Key: 'audio/media-id',
      Expires: 600,
    });
    expect(options.Conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 25 * 1024 * 1024],
        ['content-length-range', 3, 3],
        ['eq', '$key', 'audio/media-id'],
        ['eq', '$Content-Type', 'audio/mpeg'],
      ]),
    );
    expect(result.expiresAt).toBe('2026-07-24T00:10:00.000Z');
  });

  it('Head metadata와 Get 전체 bytes로 실제 SHA-256을 계산한다', async () => {
    const bytes = new TextEncoder().encode('abc');
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ContentLength: bytes.byteLength,
        ContentType: 'audio/mpeg',
      })
      .mockResolvedValueOnce({
        Body: { transformToByteArray: vi.fn().mockResolvedValue(bytes) },
      });
    const provider = new S3AudioUploadProvider(
      { send } as never,
      'media-bucket',
    );

    await expect(provider.inspect('audio/media-id')).resolves.toEqual({
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  });

  it('AWS message와 bucket·key를 stable storage 오류 밖으로 노출하지 않는다', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(
        new Error('AccessDenied media-bucket audio/private-key'),
      );
    const provider = new S3AudioUploadProvider(
      { send } as never,
      'media-bucket',
    );

    const error = await provider
      .inspect('audio/private-key')
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AudioUploadStorageError);
    expect(error).toMatchObject({ code: 'AUDIO_UPLOAD_STORAGE_FAILED' });
    expect(String(error)).not.toContain('AccessDenied');
    expect(String(error)).not.toContain('media-bucket');
    expect(String(error)).not.toContain('audio/private-key');
  });
});
