/** local filesystem upload adapter의 HMAC policy와 실제 bytes 검사를 검증한다 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileUploadProvider } from './local-file-upload.provider.js';

const directories: string[] = [];
const now = new Date('2026-07-31T00:00:00.000Z');
const uploadId = '00000000-0000-4000-8000-000000000001';
const inputKey = `inputs/00000000-0000-4000-8000-000000000002/${uploadId}`;
const audioId = '00000000-0000-4000-8000-000000000003';
const secret = 'local-upload-hmac-secret-that-is-not-production';

const createStorage = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flex-thia-local-upload-'));
  directories.push(directory);
  return new LocalFileUploadProvider(
    directory,
    'http://localhost:5173',
    secret,
    () => now,
  );
};

const tokenFrom = (url: string): string => url.split('/').at(-1)!;

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('LocalFileUploadProvider', () => {
  it('same-origin policy로 저장한 실제 text bytes를 inspection한다', async () => {
    const storage = await createStorage();
    const bytes = Buffer.from('태국어 학습', 'utf8');
    const policy = await storage.createPolicy({
      uploadId,
      objectKey: inputKey,
      inputType: 'TEXT',
      contentType: 'text/plain',
      declaredSizeBytes: bytes.byteLength,
    });

    await storage.store({
      token: tokenFrom(policy.url),
      storageKey: policy.fields.key!,
      contentType: policy.fields['Content-Type']!,
      bytes,
    });

    expect(policy.url).toMatch(
      /^http:\/\/localhost:5173\/api\/v1\/local-uploads\//u,
    );
    expect(await storage.inspectObject(inputKey)).toEqual({
      sizeBytes: bytes.byteLength,
      contentType: 'text/plain',
      detectedType: 'TEXT',
      encryptedPdf: false,
      pdfPageCount: null,
    });
  });

  it('token에 고정되지 않은 key·content type·size·path를 저장 전에 거절한다', async () => {
    const storage = await createStorage();
    const policy = await storage.createPolicy({
      uploadId,
      objectKey: inputKey,
      inputType: 'TEXT',
      contentType: 'text/plain',
      declaredSizeBytes: 3,
    });
    const token = tokenFrom(policy.url);

    await expect(
      storage.store({
        token,
        storageKey: inputKey.replace('inputs/', 'audio/uploads/'),
        contentType: 'text/plain',
        bytes: Buffer.from('abc'),
      }),
    ).rejects.toThrow('LOCAL_UPLOAD_INVALID');
    await expect(
      storage.store({
        token,
        storageKey: inputKey,
        contentType: 'application/pdf',
        bytes: Buffer.from('abc'),
      }),
    ).rejects.toThrow('LOCAL_UPLOAD_INVALID');
    await expect(
      storage.store({
        token,
        storageKey: inputKey,
        contentType: 'text/plain',
        bytes: Buffer.from('abcd'),
      }),
    ).rejects.toThrow('LOCAL_UPLOAD_INVALID');
    await expect(storage.inspectObject('../private.txt')).rejects.toThrow(
      'LOCAL_UPLOAD_INVALID',
    );
  });

  it('만료 token과 audio SHA-256 불일치를 거절한다', async () => {
    const storage = await createStorage();
    const expired = new LocalFileUploadProvider(
      directories.at(-1)!,
      'http://localhost:5173',
      secret,
      () => new Date(now.getTime() + 601_000),
    );
    const policy = await storage.createPolicy({
      uploadId,
      objectKey: inputKey,
      inputType: 'TEXT',
      contentType: 'text/plain',
      declaredSizeBytes: 3,
    });
    const audio = await storage.createUpload({
      mediaAssetId: audioId,
      storageKey: `audio/uploads/${audioId}`,
      mimeType: 'audio/wav',
      sizeBytes: 3,
      sha256: createHash('sha256').update('expected').digest('hex'),
    });

    await expect(
      expired.store({
        token: tokenFrom(policy.url),
        storageKey: inputKey,
        contentType: 'text/plain',
        bytes: Buffer.from('abc'),
      }),
    ).rejects.toThrow('LOCAL_UPLOAD_NOT_FOUND');
    await expect(
      storage.store({
        token: tokenFrom(audio.url),
        storageKey: audio.fields.key!,
        contentType: audio.fields['Content-Type']!,
        bytes: Buffer.from('bad'),
      }),
    ).rejects.toThrow('LOCAL_UPLOAD_INVALID');
  });
});
