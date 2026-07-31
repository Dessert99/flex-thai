/** local seed media command가 READY object만 재현 가능한 WAV container로 쓰는지 검증한다 */
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileMediaReadProvider } from '../storage/local-file-media-read.provider.js';
import { localSeedMediaFixtures, seedLocalMedia } from './seed-local-media.js';

const directories: string[] = [];
const now = new Date('2026-07-31T00:00:00.000Z');
const secret = 'local-media-hmac-secret-that-is-not-production';

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('seedLocalMedia', () => {
  it('격리된 workspace에서도 command 실행에 필요한 tsx를 직접 소유한다', () => {
    const packageJson = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../package.json', import.meta.url)),
        'utf8',
      ),
    ) as {
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.devDependencies?.tsx).toBeDefined();
  });

  it('모든 READY seed key의 deterministic WAV를 반복 실행해도 같은 signed reader bytes로 제공한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flex-thia-seed-media-'));
    directories.push(directory);
    const reader = new LocalFileMediaReadProvider(
      directory,
      'http://localhost:5173',
      secret,
      () => now,
    );

    await seedLocalMedia({ directory });
    await seedLocalMedia({ directory });

    expect(localSeedMediaFixtures.map(({ storageKey }) => storageKey)).toEqual([
      'private/tts/runs/00000000-0000-4000-8000-000000000010.wav',
      'private/tts/runs/00000000-0000-4000-8000-000000000011.wav',
      'private/tts/runs/00000000-0000-4000-8000-000000000013.wav',
    ]);
    for (const fixture of localSeedMediaFixtures) {
      const url = new URL(
        await reader.createReadUrl(
          fixture.storageKey,
          new Date(now.getTime() + 60_000),
        ),
      );
      await expect(
        reader.read({
          objectId: url.pathname.split('/').at(-1)!,
          expires: url.searchParams.get('expires')!,
          signature: url.searchParams.get('signature')!,
        }),
      ).resolves.toEqual({
        mimeType: 'audio/wav',
        bytes: fixture.bytes,
      });
    }
  });

  it('UPLOADING seed media에는 fixture를 만들지 않는다', () => {
    expect(
      localSeedMediaFixtures.map(({ storageKey }) => storageKey),
    ).not.toContain(
      'private/tts/runs/00000000-0000-4000-8000-000000000012.wav',
    );
  });
});
