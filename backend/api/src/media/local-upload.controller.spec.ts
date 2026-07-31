/** local multipart upload controller가 token 실패를 안전한 HTTP 오류로 제한하는지 검증한다 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalFileUploadProvider } from '@flex-thia/providers';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalUploadController } from './local-upload.controller.js';

const directories: string[] = [];
const now = new Date('2026-07-31T00:00:00.000Z');
const secret = 'local-upload-hmac-secret-that-is-not-production';
const uploadId = '00000000-0000-4000-8000-000000000001';
const storageKey = `inputs/00000000-0000-4000-8000-000000000002/${uploadId}`;

const createController = async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'flex-thia-local-controller-'),
  );
  directories.push(directory);
  const storage = new LocalFileUploadProvider(
    directory,
    'http://localhost:5173',
    secret,
    () => now,
  );
  return { controller: new LocalUploadController(storage), storage };
};

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('LocalUploadController', () => {
  it('유효한 multipart file을 204로 저장한다', async () => {
    const { controller, storage } = await createController();
    const bytes = Buffer.from('abc');
    const policy = await storage.createPolicy({
      uploadId,
      objectKey: storageKey,
      inputType: 'TEXT',
      contentType: 'text/plain',
      declaredSizeBytes: bytes.byteLength,
    });
    const token = policy.url.split('/').at(-1)!;

    await expect(
      controller.upload(token, policy.fields, {
        buffer: bytes,
        mimetype: 'text/plain',
        size: bytes.byteLength,
      }),
    ).resolves.toBeUndefined();
    await expect(storage.inspectObject(storageKey)).resolves.toMatchObject({
      sizeBytes: bytes.byteLength,
    });
  });

  it('token과 storage 오류를 path·secret 없는 400 또는 404 problem으로 제한한다', async () => {
    const { controller } = await createController();

    const invalidToken = await controller
      .upload(
        'invalid-token',
        { key: storageKey, 'Content-Type': 'text/plain' },
        { buffer: Buffer.from('abc'), mimetype: 'text/plain', size: 3 },
      )
      .catch((error: unknown) => error);
    const invalidFields = await controller
      .upload('invalid-token', { key: '../private' }, undefined)
      .catch((error: unknown) => error);

    expect(invalidToken).toBeInstanceOf(NotFoundException);
    expect(invalidFields).toBeInstanceOf(BadRequestException);
    expect(
      JSON.stringify((invalidToken as NotFoundException).getResponse()),
    ).not.toContain(storageKey);
    expect(
      JSON.stringify((invalidFields as BadRequestException).getResponse()),
    ).not.toContain(secret);
  });
});
