/** 관리자 음성 업로드와 자산 사용처 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  audioUploadRequestSchema,
  audioUploadResponseSchema,
  mediaAssetDetailResponseSchema,
  mediaAssetIdPathSchema,
} from './media-assets.js';

const ids = {
  media: '00000000-0000-4000-8000-000000000001',
  pronunciation: '00000000-0000-4000-8000-000000000002',
  sentence: '00000000-0000-4000-8000-000000000003',
} as const;

describe('관리자 음성 업로드 요청 계약', () => {
  it('파일명·허용 MIME·1 byte부터 25 MiB·SHA-256을 검증한다', () => {
    const request = {
      filename: 'greeting.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
    };
    expect(audioUploadRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      audioUploadRequestSchema.parse({ ...request, sizeBytes: 0 }),
    ).toThrow();
    expect(() =>
      audioUploadRequestSchema.parse({
        ...request,
        sizeBytes: 25 * 1024 * 1024 + 1,
      }),
    ).toThrow();
    expect(() =>
      audioUploadRequestSchema.parse({ ...request, mimeType: 'audio/aac' }),
    ).toThrow();
    expect(() =>
      audioUploadRequestSchema.parse({ ...request, sha256: 'not-a-hash' }),
    ).toThrow();
  });

  it('알려지지 않은 선언 metadata와 비 UUID path를 거부한다', () => {
    expect(() =>
      audioUploadRequestSchema.parse({
        filename: 'greeting.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
        sha256: 'a'.repeat(64),
        storageKey: 'audio/private',
      }),
    ).toThrow();
    expect(mediaAssetIdPathSchema.parse({ mediaAssetId: ids.media })).toEqual({
      mediaAssetId: ids.media,
    });
    expect(() =>
      mediaAssetIdPathSchema.parse({ mediaAssetId: 'not-a-uuid' }),
    ).toThrow();
  });
});

describe('관리자 음성 자산 공개 응답 계약', () => {
  it('업로드 필요와 READY 재사용 응답을 구분한다', () => {
    const uploadRequired = {
      mediaAssetId: ids.media,
      status: 'UPLOADING',
      uploadRequired: true,
      upload: {
        url: 'https://uploads.example.com/',
        fields: { key: 'opaque-policy-field', policy: 'signed-policy' },
        expiresAt: '2026-07-24T00:10:00.000Z',
      },
    } as const;
    const reused = {
      mediaAssetId: ids.media,
      status: 'READY',
      uploadRequired: false,
      reused: true,
    } as const;

    expect(audioUploadResponseSchema.parse(uploadRequired)).toEqual(
      uploadRequired,
    );
    expect(audioUploadResponseSchema.parse(reused)).toEqual(reused);
    expect(() =>
      audioUploadResponseSchema.parse({
        ...uploadRequired,
        storageKey: `audio/${ids.media}`,
      }),
    ).toThrow();
  });

  it('상태와 발음·문장 사용처를 공개하되 storage key를 거부한다', () => {
    const detail = {
      id: ids.media,
      kind: 'AUDIO',
      status: 'READY',
      declaredMimeType: 'audio/mpeg',
      declaredSizeBytes: 1024,
      declaredSha256: 'a'.repeat(64),
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
      readyAt: '2026-07-24T00:00:00.000Z',
      createdAt: '2026-07-23T23:59:00.000Z',
      usage: {
        pronunciations: { count: 1, ids: [ids.pronunciation] },
        sentences: { count: 1, ids: [ids.sentence] },
      },
    } as const;

    expect(mediaAssetDetailResponseSchema.parse(detail)).toEqual(detail);
    expect(() =>
      mediaAssetDetailResponseSchema.parse({
        ...detail,
        storageKey: `audio/${ids.media}`,
      }),
    ).toThrow();
  });
});
