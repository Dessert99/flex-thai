/** 음성 자산의 완료·거절·게시 준비 상태를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assertMediaAssetReady,
  completeMediaAsset,
  rejectMediaAsset,
  type MediaAsset,
} from './media-asset.js';

const uploadingAsset = (): MediaAsset => ({
  id: 'asset-id',
  kind: 'AUDIO',
  storageKey: 'audio/asset-id',
  declaredMimeType: 'audio/mpeg',
  declaredSizeBytes: 1024,
  declaredSha256: 'a'.repeat(64),
  mimeType: null,
  sizeBytes: null,
  sha256: null,
  status: 'UPLOADING',
  readyAt: null,
});

const readReadySha256 = (asset: MediaAsset): string => {
  assertMediaAssetReady(asset);
  return asset.sha256.toUpperCase();
};

describe('MediaAsset 음성 자산 수명 규칙', () => {
  it('선언 정보와 검사 정보가 같을 때만 READY로 전이한다', () => {
    const readyAt = new Date('2026-07-24T00:00:00.000Z');

    expect(
      completeMediaAsset(
        uploadingAsset(),
        {
          mimeType: 'audio/mpeg',
          sizeBytes: 1024,
          sha256: 'a'.repeat(64),
        },
        readyAt,
      ),
    ).toMatchObject({
      status: 'READY',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
      readyAt,
    });
  });

  it('검사 정보가 선언과 다르면 안정적인 오류를 반환한다', () => {
    expect(() =>
      completeMediaAsset(
        uploadingAsset(),
        {
          mimeType: 'audio/mpeg',
          sizeBytes: 1025,
          sha256: 'a'.repeat(64),
        },
        new Date(),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'MEDIA_INSPECTION_MISMATCH' }),
    );
  });

  it('READY 자산은 완료하거나 거절해 덮어쓸 수 없다', () => {
    const ready = completeMediaAsset(
      uploadingAsset(),
      {
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
        sha256: 'a'.repeat(64),
      },
      new Date(),
    );

    expect(() =>
      rejectMediaAsset(ready, {
        mimeType: 'audio/ogg',
        sizeBytes: 1024,
        sha256: 'b'.repeat(64),
      }),
    ).toThrowError(expect.objectContaining({ code: 'MEDIA_ASSET_IMMUTABLE' }));
  });

  it('불일치로 거절할 때 실제 MIME·size·SHA-256을 보존한다', () => {
    expect(
      rejectMediaAsset(uploadingAsset(), {
        mimeType: 'application/octet-stream',
        sizeBytes: 1025,
        sha256: 'B'.repeat(64),
      }),
    ).toMatchObject({
      status: 'REJECTED',
      mimeType: 'application/octet-stream',
      sizeBytes: 1025,
      sha256: 'b'.repeat(64),
      readyAt: null,
    });
  });

  it('선언과 모두 같은 actual metadata로 REJECTED를 만들 수 없다', () => {
    expect(() =>
      rejectMediaAsset(uploadingAsset(), {
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
        sha256: 'a'.repeat(64),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'MEDIA_REJECTION_MATCHES_DECLARATION',
      }),
    );
  });

  it('게시 준비 확인은 READY가 아닌 자산을 거부한다', () => {
    expect(() => assertMediaAssetReady(uploadingAsset())).toThrowError(
      expect.objectContaining({ code: 'MEDIA_ASSET_NOT_READY' }),
    );
  });

  it('READY 상태를 위조해도 실제 metadata와 readyAt이 없으면 거부한다', () => {
    const forgedReady = {
      ...uploadingAsset(),
      status: 'READY',
    } as unknown as MediaAsset;

    expect(() => assertMediaAssetReady(forgedReady)).toThrowError(
      expect.objectContaining({ code: 'MEDIA_ASSET_NOT_READY' }),
    );
  });

  it('READY assertion 뒤에는 실제 SHA-256을 non-null로 좁힌다', () => {
    const ready = completeMediaAsset(
      uploadingAsset(),
      {
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
        sha256: 'a'.repeat(64),
      },
      new Date(),
    );

    expect(readReadySha256(ready)).toBe('A'.repeat(64));
  });
});
