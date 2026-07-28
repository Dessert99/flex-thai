/** local TTS container를 private key 없는 단기 HMAC URL로 읽는지 검증한다 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileTtsAudioStore } from './local-file-tts-audio.store.js';
import { LocalFileMediaReadProvider } from './local-file-media-read.provider.js';

const directories: string[] = [];
const storageKey = 'private/tts/runs/00000000-0000-4000-8000-000000000001.wav';
const secret = 'local-media-hmac-secret-that-is-not-production';
const now = new Date('2026-07-28T00:00:00.000Z');

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('LocalFileMediaReadProvider', () => {
  it('LocalFileTtsAudioStore의 exact WAV를 storage key 없는 URL로 읽는다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flex-thia-media-read-'));
    directories.push(directory);
    const bytes = Uint8Array.from([82, 73, 70, 70, 1, 2, 3]);
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
      secret,
      () => now,
    );

    const readUrl = await provider.createReadUrl(
      storageKey,
      new Date(now.getTime() + 60_000),
    );
    const url = new URL(readUrl);
    const objectId = url.pathname.split('/').at(-1)!;
    const result = await provider.read({
      objectId,
      expires: url.searchParams.get('expires')!,
      signature: url.searchParams.get('signature')!,
    });

    expect(readUrl).toMatch(
      /^http:\/\/localhost:3000\/api\/v1\/local-media\/[a-f0-9]{64}\?/u,
    );
    expect(readUrl).not.toContain(storageKey);
    expect(result).toEqual({
      mimeType: 'audio/wav',
      bytes: Buffer.from(bytes),
    });
  });

  it('만료·변조 token과 다른 object ID는 모두 찾을 수 없음으로 거절한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flex-thia-media-read-'));
    directories.push(directory);
    const provider = new LocalFileMediaReadProvider(
      directory,
      'http://localhost:3000',
      secret,
      () => now,
    );
    const url = new URL(
      await provider.createReadUrl(
        storageKey,
        new Date(now.getTime() + 60_000),
      ),
    );
    const objectId = url.pathname.split('/').at(-1)!;
    const expires = url.searchParams.get('expires')!;
    const signature = url.searchParams.get('signature')!;

    await expect(
      provider.read({
        objectId,
        expires: String(Math.floor(now.getTime() / 1000) - 1),
        signature,
      }),
    ).rejects.toThrow('LOCAL_MEDIA_NOT_FOUND');
    await expect(
      provider.read({
        objectId,
        expires,
        signature: `${signature.slice(0, -1)}0`,
      }),
    ).rejects.toThrow('LOCAL_MEDIA_NOT_FOUND');
    await expect(
      provider.read({
        objectId: '0'.repeat(64),
        expires,
        signature,
      }),
    ).rejects.toThrow('LOCAL_MEDIA_NOT_FOUND');
  });
});
