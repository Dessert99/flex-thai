/** audio S3 adapter의 temporary upload·pinned read·write-once seal을 고정한다 */
import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { AudioUploadStorageError } from '@flex-thia/domain';
import { describe, expect, it, vi } from 'vitest';
import { S3AudioUploadProvider } from './audio-upload.provider.js';

const temporaryStorageKey = 'audio/uploads/media-id';
const finalStorageKey = 'audio/media-id';

const body = (bytes: Uint8Array) => ({
  transformToByteArray: vi.fn().mockResolvedValue(bytes),
});

const commandInput = (command: unknown): Record<string, unknown> => {
  if (
    typeof command !== 'object' ||
    command === null ||
    !('input' in command) ||
    typeof command.input !== 'object' ||
    command.input === null
  ) {
    throw new Error('AWS command input이 없습니다');
  }
  return command.input as Record<string, unknown>;
};

describe('S3 음성 업로드 policy', () => {
  it('final key가 아닌 temporary key에만 10분 exact policy를 발급한다', async () => {
    const sign = vi.fn().mockResolvedValue({
      url: 'https://media-bucket.s3.amazonaws.com',
      fields: { key: temporaryStorageKey, 'Content-Type': 'audio/mpeg' },
    });
    const provider = new S3AudioUploadProvider(
      {} as never,
      'media-bucket',
      sign,
      () => new Date('2026-07-24T00:00:00.000Z'),
    );

    const result = await provider.createUpload({
      mediaAssetId: 'media-id',
      storageKey: temporaryStorageKey,
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256: 'a'.repeat(64),
    });
    const options = sign.mock.calls[0]?.[1] as {
      Bucket: string;
      Key: string;
      Expires: number;
      Conditions: unknown[];
    };

    expect(options).toMatchObject({
      Bucket: 'media-bucket',
      Key: temporaryStorageKey,
      Expires: 600,
    });
    expect(options.Key).not.toBe(finalStorageKey);
    expect(options.Conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 25 * 1024 * 1024],
        ['content-length-range', 3, 3],
        ['eq', '$key', temporaryStorageKey],
        ['eq', '$Content-Type', 'audio/mpeg'],
      ]),
    );
    expect(result.expiresAt).toBe('2026-07-24T00:10:00.000Z');
  });
});

describe('S3 음성 object seal', () => {
  it('Head ETag/version으로 Get을 고정하고 final key를 write-once로 저장한 뒤 temp를 지운다', async () => {
    const bytes = new TextEncoder().encode('abc');
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ContentLength: bytes.byteLength,
        ContentType: 'audio/mpeg',
        ETag: '"temp-etag"',
        VersionId: 'temp-version',
      })
      .mockResolvedValueOnce({ Body: body(bytes) })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const provider = new S3AudioUploadProvider(
      { send } as never,
      'media-bucket',
    );

    await expect(
      provider.inspectAndSeal({ temporaryStorageKey, finalStorageKey }),
    ).resolves.toEqual({
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect(commandInput(send.mock.calls[0]?.[0])).toEqual({
      Bucket: 'media-bucket',
      Key: temporaryStorageKey,
    });
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(commandInput(send.mock.calls[1]?.[0])).toEqual({
      Bucket: 'media-bucket',
      Key: temporaryStorageKey,
      IfMatch: '"temp-etag"',
      VersionId: 'temp-version',
    });
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(commandInput(send.mock.calls[2]?.[0])).toMatchObject({
      Bucket: 'media-bucket',
      Key: finalStorageKey,
      Body: bytes,
      ContentType: 'audio/mpeg',
      IfNoneMatch: '*',
      ChecksumSHA256: createHash('sha256').update(bytes).digest('base64'),
    });
    expect(send.mock.calls[3]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(commandInput(send.mock.calls[3]?.[0])).toEqual({
      Bucket: 'media-bucket',
      Key: temporaryStorageKey,
      VersionId: 'temp-version',
    });
  });

  it('final key가 이미 있으면 덮어쓰지 않고 기존 version을 pinned read해 반환한다', async () => {
    const temporaryBytes = new TextEncoder().encode('abc');
    const finalBytes = new TextEncoder().encode('existing');
    const preconditionFailure = Object.assign(new Error('private key leaked'), {
      name: 'PreconditionFailed',
      $metadata: { httpStatusCode: 412 },
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ContentLength: temporaryBytes.byteLength,
        ContentType: 'audio/mpeg',
        ETag: '"temp-etag"',
      })
      .mockResolvedValueOnce({ Body: body(temporaryBytes) })
      .mockRejectedValueOnce(preconditionFailure)
      .mockResolvedValueOnce({
        ContentLength: finalBytes.byteLength,
        ContentType: 'audio/ogg',
        ETag: '"final-etag"',
        VersionId: 'final-version',
      })
      .mockResolvedValueOnce({ Body: body(finalBytes) })
      .mockResolvedValueOnce({});
    const provider = new S3AudioUploadProvider(
      { send } as never,
      'media-bucket',
    );

    await expect(
      provider.inspectAndSeal({ temporaryStorageKey, finalStorageKey }),
    ).resolves.toEqual({
      mimeType: 'audio/ogg',
      sizeBytes: finalBytes.byteLength,
      sha256: createHash('sha256').update(finalBytes).digest('hex'),
    });

    expect(send).toHaveBeenCalledTimes(6);
    expect(send.mock.calls[3]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect(commandInput(send.mock.calls[3]?.[0])).toEqual({
      Bucket: 'media-bucket',
      Key: finalStorageKey,
    });
    expect(send.mock.calls[4]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(commandInput(send.mock.calls[4]?.[0])).toEqual({
      Bucket: 'media-bucket',
      Key: finalStorageKey,
      IfMatch: '"final-etag"',
      VersionId: 'final-version',
    });
    expect(send.mock.calls[5]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('seal 실패 시 temp를 지우지 않고 공급자 상세를 stable 오류로 숨긴다', async () => {
    const bytes = new TextEncoder().encode('abc');
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ContentLength: bytes.byteLength,
        ContentType: 'audio/mpeg',
        ETag: '"temp-etag"',
      })
      .mockResolvedValueOnce({ Body: body(bytes) })
      .mockRejectedValueOnce(
        new Error('AccessDenied media-bucket audio/private-key'),
      );
    const provider = new S3AudioUploadProvider(
      { send } as never,
      'media-bucket',
    );

    const error = await provider
      .inspectAndSeal({ temporaryStorageKey, finalStorageKey })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AudioUploadStorageError);
    expect(error).toMatchObject({ code: 'AUDIO_UPLOAD_STORAGE_FAILED' });
    expect(String(error)).not.toContain('AccessDenied');
    expect(String(error)).not.toContain('media-bucket');
    expect(String(error)).not.toContain('audio/private-key');
    expect(send).toHaveBeenCalledTimes(3);
    expect(
      send.mock.calls.some(
        ([command]) => command instanceof DeleteObjectCommand,
      ),
    ).toBe(false);
  });

  it.each([
    [
      '404',
      Object.assign(new Error('temporary missing'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      'NoSuchKey',
      Object.assign(new Error('temporary missing'), {
        name: 'NoSuchKey',
      }),
    ],
  ])(
    'temporary Head %s이면 existing final을 pinned read한다',
    async (_case, temporaryMissing) => {
      const finalBytes = new TextEncoder().encode('existing');
      const send = vi
        .fn()
        .mockRejectedValueOnce(temporaryMissing)
        .mockResolvedValueOnce({
          ContentLength: finalBytes.byteLength,
          ContentType: 'audio/mpeg',
          ETag: '"final-etag"',
          VersionId: 'final-version',
        })
        .mockResolvedValueOnce({ Body: body(finalBytes) });
      const provider = new S3AudioUploadProvider(
        { send } as never,
        'media-bucket',
      );

      await expect(
        provider.inspectAndSeal({ temporaryStorageKey, finalStorageKey }),
      ).resolves.toEqual({
        mimeType: 'audio/mpeg',
        sizeBytes: finalBytes.byteLength,
        sha256: createHash('sha256').update(finalBytes).digest('hex'),
      });

      expect(send).toHaveBeenCalledTimes(3);
      expect(commandInput(send.mock.calls[1]?.[0])).toEqual({
        Bucket: 'media-bucket',
        Key: finalStorageKey,
      });
      expect(commandInput(send.mock.calls[2]?.[0])).toEqual({
        Bucket: 'media-bucket',
        Key: finalStorageKey,
        IfMatch: '"final-etag"',
        VersionId: 'final-version',
      });
    },
  );

  it('temporary와 final이 모두 없으면 stable 오류로 종료한다', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('temporary missing'), {
          name: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('final missing'), {
          name: 'NoSuchKey',
        }),
      );
    const provider = new S3AudioUploadProvider(
      { send } as never,
      'media-bucket',
    );

    await expect(
      provider.inspectAndSeal({ temporaryStorageKey, finalStorageKey }),
    ).rejects.toMatchObject({ code: 'AUDIO_UPLOAD_STORAGE_FAILED' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('temporary 임의 AWS 오류는 final fallback 없이 stable 오류로 종료한다', async () => {
    const send = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('private AccessDenied details'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      }),
    );
    const provider = new S3AudioUploadProvider(
      { send } as never,
      'media-bucket',
    );

    const error = await provider
      .inspectAndSeal({ temporaryStorageKey, finalStorageKey })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AudioUploadStorageError);
    expect(String(error)).not.toContain('AccessDenied');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
