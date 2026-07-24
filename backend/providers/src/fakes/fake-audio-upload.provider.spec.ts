/** local audio upload fake의 선언 기반 검사와 오류 제어를 고정한다 */
import { AudioUploadStorageError } from '@flex-thia/domain';
import { describe, expect, it } from 'vitest';
import { FakeAudioUploadProvider } from './fake-audio-upload.provider.js';

const temporaryStorageKey = 'audio/uploads/media-id';
const finalStorageKey = 'audio/media-id';
const sha256 = 'a'.repeat(64);
const now = new Date('2026-07-24T00:00:00.000Z');

describe('FakeAudioUploadProvider 기본 upload 흐름', () => {
  it('선언 metadata를 검사 결과로 기억하고 주입 시각보다 10분 뒤 만료한다', async () => {
    const provider = new FakeAudioUploadProvider(new Map(), () => now);

    const upload = await provider.createUpload({
      mediaAssetId: 'media-id',
      storageKey: temporaryStorageKey,
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256,
    });

    expect(upload).toEqual({
      url: 'http://localhost/__fake_audio_upload__',
      fields: {
        key: temporaryStorageKey,
        'Content-Type': 'audio/mpeg',
      },
      expiresAt: '2026-07-24T00:10:00.000Z',
    });
    await expect(
      provider.inspectAndSeal({ temporaryStorageKey, finalStorageKey }),
    ).resolves.toEqual({
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256,
    });
  });
});

describe('FakeAudioUploadProvider 검사 제어', () => {
  it('사전 주입한 mismatch inspection을 upload 선언으로 덮어쓰지 않는다', async () => {
    const mismatch = {
      mimeType: 'audio/ogg',
      sizeBytes: 4,
      sha256: 'b'.repeat(64),
    };
    const provider = new FakeAudioUploadProvider(
      new Map([[temporaryStorageKey, mismatch]]),
      () => now,
    );

    await provider.createUpload({
      mediaAssetId: 'media-id',
      storageKey: temporaryStorageKey,
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256,
    });

    await expect(
      provider.inspectAndSeal({ temporaryStorageKey, finalStorageKey }),
    ).resolves.toEqual(mismatch);
  });

  it('upload 선언이 없는 key는 stable storage 오류로 거절한다', async () => {
    const provider = new FakeAudioUploadProvider();

    await expect(
      provider.inspectAndSeal({
        temporaryStorageKey: 'audio/uploads/missing',
        finalStorageKey,
      }),
    ).rejects.toBeInstanceOf(AudioUploadStorageError);
  });
});
