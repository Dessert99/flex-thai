/** 관리자 음성 업로드와 자산 사용처 공개 계약을 검증한다 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CompleteMediaAssetResponse } from './media-assets.js';
import {
  audioUploadRequestSchema,
  audioUploadResponseSchema,
  completeMediaAssetResponseSchema,
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
        fields: {
          key: 'opaque-policy-field',
          policy: 'signed-policy',
          'x-amz-algorithm': 'AWS4-HMAC-SHA256',
          'Content-Type': 'audio/mpeg',
        },
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

  it('presigned form의 일반 S3 field는 허용하고 내부 이름은 중첩 위치에서도 거부한다', () => {
    const response = {
      mediaAssetId: ids.media,
      status: 'UPLOADING',
      uploadRequired: true,
      upload: {
        url: 'https://uploads.example.com/',
        fields: {
          key: 'audio/server-selected-id',
          policy: 'signed-policy',
          'x-amz-credential': 'credential',
          'Content-Type': 'audio/mpeg',
        },
        expiresAt: '2026-07-24T00:10:00.000Z',
      },
    } as const;

    expect(audioUploadResponseSchema.parse(response)).toEqual(response);
    for (const internalKey of [
      'storageKey',
      'storage_key',
      'RequestHash',
      'reference-map',
      'isCorrect',
      'db_row',
    ]) {
      expect(() =>
        audioUploadResponseSchema.parse({
          ...response,
          upload: {
            ...response.upload,
            fields: { ...response.upload.fields, [internalKey]: 'private' },
          },
        }),
      ).toThrow();
    }
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

  it('완료 응답의 READY 상태와 검증 시각 type을 고정한다', () => {
    const response = completeMediaAssetResponseSchema.parse({
      mediaAssetId: ids.media,
      status: 'READY',
      readyAt: '2026-07-24T00:00:00.000Z',
    });

    expectTypeOf(response).toEqualTypeOf<CompleteMediaAssetResponse>();
    expect(response.status).toBe('READY');
  });

  it('READY 상태는 확정 metadata가 필요하고 미완료 상태는 모두 null이어야 한다', () => {
    const ready = {
      id: ids.media,
      kind: 'AUDIO',
      status: 'READY',
      declaredMimeType: 'audio/mpeg',
      declaredSizeBytes: 1024,
      declaredSha256: 'A'.repeat(64),
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
      readyAt: '2026-07-24T00:00:00.000Z',
      createdAt: '2026-07-23T23:59:00.000Z',
      usage: {
        pronunciations: { count: 0, ids: [] },
        sentences: { count: 0, ids: [] },
      },
    } as const;

    expect(() =>
      mediaAssetDetailResponseSchema.parse({ ...ready, mimeType: null }),
    ).toThrow();
    expect(mediaAssetDetailResponseSchema.parse(ready)).toEqual(ready);
    expect(() =>
      mediaAssetDetailResponseSchema.parse({
        ...ready,
        mimeType: 'audio/wav',
      }),
    ).toThrow();
    expect(() =>
      mediaAssetDetailResponseSchema.parse({ ...ready, sizeBytes: 2048 }),
    ).toThrow();
    expect(() =>
      mediaAssetDetailResponseSchema.parse({
        ...ready,
        sha256: 'b'.repeat(64),
      }),
    ).toThrow();
    expect(() =>
      mediaAssetDetailResponseSchema.parse({
        ...ready,
        status: 'UPLOADING',
      }),
    ).toThrow();
    expect(
      mediaAssetDetailResponseSchema.parse({
        ...ready,
        status: 'REJECTED',
        mimeType: null,
        sizeBytes: null,
        sha256: null,
        readyAt: null,
      }),
    ).toEqual({
      ...ready,
      status: 'REJECTED',
      mimeType: null,
      sizeBytes: null,
      sha256: null,
      readyAt: null,
    });
  });
});
