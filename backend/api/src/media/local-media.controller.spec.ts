/** local HMAC media Controller가 WAV만 반환하고 모든 token 오류를 숨기는지 검증한다 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundException, type StreamableFile } from '@nestjs/common';
import {
  LocalFileMediaReadProvider,
  LocalFileTtsAudioStore,
} from '@flex-thia/providers';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalMediaController } from './local-media.controller.js';

const directories: string[] = [];
const storageKey = 'private/tts/runs/00000000-0000-4000-8000-000000000001.wav';
const now = new Date('2026-07-28T00:00:00.000Z');

const readStreamableFile = async (file: StreamableFile): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
};

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('LocalMediaController', () => {
  it('store가 쓴 exact WAV bytes를 서명 URL의 object ID로 반환한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flex-thia-controller-'));
    directories.push(directory);
    const bytes = Uint8Array.from([82, 73, 70, 70, 9, 8, 7]);
    await new LocalFileTtsAudioStore(directory).put({
      storageKey,
      bytes,
      mimeType: 'audio/wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      signal: new AbortController().signal,
      deadline: new Date(Date.now() + 60_000),
    });
    const provider = new LocalFileMediaReadProvider(
      directory,
      'http://localhost:3000',
      'local-media-hmac-secret-that-is-not-production',
      () => now,
    );
    const controller = new LocalMediaController(provider);
    const url = new URL(
      await provider.createReadUrl(
        storageKey,
        new Date(now.getTime() + 60_000),
      ),
    );

    const response = await controller.read(url.pathname.split('/').at(-1)!, {
      expires: url.searchParams.get('expires')!,
      signature: url.searchParams.get('signature')!,
    });

    expect(response.getHeaders()).toMatchObject({
      type: 'audio/wav',
      disposition: 'inline',
    });
    await expect(readStreamableFile(response)).resolves.toEqual(
      Buffer.from(bytes),
    );
  });

  it('만료 token은 storage 경로나 private key 없이 404로 통일한다', async () => {
    const provider = {
      read: () =>
        Promise.reject(new Error(`LOCAL_MEDIA_NOT_FOUND:${storageKey}`)),
    };
    const controller = new LocalMediaController(provider as never);

    await expect(
      controller.read('0'.repeat(64), {
        expires: '0',
        signature: '0'.repeat(64),
      }),
    ).rejects.toEqual(expect.any(NotFoundException));
    try {
      await controller.read('0'.repeat(64), {
        expires: '0',
        signature: '0'.repeat(64),
      });
    } catch (error) {
      expect(
        JSON.stringify((error as NotFoundException).getResponse()),
      ).not.toContain(storageKey);
    }
  });
});
