/** 관리자 음성 업로드 요청·완료의 검증과 멱등 수명을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  AudioUploadStorage,
  MediaAdminRepository,
  MediaAssetAuditContext,
  MediaAssetFinalization,
} from './media-admin.repository.js';
import {
  MediaAdminService,
  type RequestAudioUploadCommand,
} from './media-admin.service.js';
import type { MediaAsset, ReadyMediaAsset } from './media-asset.js';

const context: MediaAssetAuditContext = {
  actorSub: 'cognito-sub',
  actorUserId: '00000000-0000-4000-8000-000000000001',
  requestId: 'request-id',
};
const sha256 = 'a'.repeat(64);
const readyAt = new Date('2026-07-24T00:00:00.000Z');
const readyAsset: ReadyMediaAsset = {
  id: '00000000-0000-4000-8000-000000000002',
  kind: 'AUDIO',
  storageKey: 'audio/00000000-0000-4000-8000-000000000002',
  declaredMimeType: 'audio/mpeg',
  declaredSizeBytes: 3,
  declaredSha256: sha256,
  mimeType: 'audio/mpeg',
  sizeBytes: 3,
  sha256,
  status: 'READY',
  readyAt,
};

const createCommand = (
  overrides: Partial<RequestAudioUploadCommand> = {},
): RequestAudioUploadCommand => ({
  filename: 'voice.mp3',
  mimeType: 'audio/mpeg',
  sizeBytes: 3,
  sha256,
  context,
  ...overrides,
});

const createRepository = (options?: {
  exactReady?: ReadyMediaAsset | null;
  asset?: MediaAsset | null;
  finalization?: MediaAssetFinalization | null;
}) => ({
  findReadyByMetadata: vi
    .fn<MediaAdminRepository['findReadyByMetadata']>()
    .mockResolvedValue(options?.exactReady ?? null),
  createUploadingWithAudit: vi
    .fn<MediaAdminRepository['createUploadingWithAudit']>()
    .mockResolvedValue(),
  findById: vi
    .fn<MediaAdminRepository['findById']>()
    .mockResolvedValue(options?.asset ?? null),
  finalizeWithAudit: vi
    .fn<MediaAdminRepository['finalizeWithAudit']>()
    .mockResolvedValue(options?.finalization ?? null),
});

const createStorage = () => ({
  createUpload: vi.fn<AudioUploadStorage['createUpload']>().mockResolvedValue({
    url: 'https://upload.invalid',
    fields: { key: `audio/uploads/${readyAsset.id}` },
    expiresAt: '2026-07-24T00:10:00.000Z',
  }),
  inspectAndSeal: vi
    .fn<AudioUploadStorage['inspectAndSeal']>()
    .mockResolvedValue({
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256,
    }),
});

describe('MediaAdminService 업로드 요청', () => {
  it.each([
    [{ sizeBytes: 0 }, 'MEDIA_UPLOAD_EMPTY'],
    [{ sizeBytes: 25 * 1024 * 1024 + 1 }, 'MEDIA_UPLOAD_TOO_LARGE'],
    [{ mimeType: 'video/mp4' }, 'MEDIA_MIME_NOT_ALLOWED'],
    [{ sha256: 'not-a-sha256' }, 'MEDIA_SHA256_INVALID'],
  ] as const)(
    '잘못된 선언 %o은 storage 호출 전에 %s로 거절한다',
    async (override, code) => {
      const repository = createRepository();
      const storage = createStorage();
      const service = new MediaAdminService(
        repository,
        storage,
        () => readyAsset.id,
      );

      await expect(
        service.requestAudioUpload(createCommand(override)),
      ).rejects.toMatchObject({ code });
      expect(repository.findReadyByMetadata).not.toHaveBeenCalled();
      expect(storage.createUpload).not.toHaveBeenCalled();
    },
  );

  it('final key는 DB에만 저장하고 별도 temporary key만 presign한다', async () => {
    const repository = createRepository();
    const storage = createStorage();
    const service = new MediaAdminService(
      repository,
      storage,
      () => readyAsset.id,
    );

    const result = await service.requestAudioUpload(createCommand());

    expect(storage.createUpload).toHaveBeenCalledWith({
      mediaAssetId: readyAsset.id,
      storageKey: `audio/uploads/${readyAsset.id}`,
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
    });
    expect(repository.createUploadingWithAudit).toHaveBeenCalledTimes(1);
    expect(
      repository.createUploadingWithAudit.mock.calls[0]?.[0],
    ).toMatchObject({
      asset: {
        id: readyAsset.id,
        storageKey: readyAsset.storageKey,
        status: 'UPLOADING',
      },
      context,
    });
    expect(result).toMatchObject({
      mediaAssetId: readyAsset.id,
      status: 'UPLOADING',
      uploadRequired: true,
      upload: {
        fields: { key: `audio/uploads/${readyAsset.id}` },
      },
    });
    expect(result.uploadRequired && result.upload.fields.key).not.toBe(
      readyAsset.storageKey,
    );
  });

  it('generator가 UUID를 반환하지 않으면 storage와 DB 호출 전에 거절한다', async () => {
    const repository = createRepository();
    const storage = createStorage();
    const service = new MediaAdminService(
      repository,
      storage,
      () => 'not-a-uuid',
    );

    await expect(
      service.requestAudioUpload(createCommand()),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_ID_INVALID' });
    expect(repository.findReadyByMetadata).not.toHaveBeenCalled();
    expect(repository.createUploadingWithAudit).not.toHaveBeenCalled();
    expect(storage.createUpload).not.toHaveBeenCalled();
  });

  it('actual hash·size·MIME이 같은 READY 자산은 row와 object를 만들지 않고 재사용한다', async () => {
    const repository = createRepository({ exactReady: readyAsset });
    const storage = createStorage();
    const service = new MediaAdminService(
      repository,
      storage,
      () => readyAsset.id,
    );

    const result = await service.requestAudioUpload(createCommand());

    expect(result).toEqual({
      mediaAssetId: readyAsset.id,
      status: 'READY',
      uploadRequired: false,
      reused: true,
    });
    expect(repository.createUploadingWithAudit).not.toHaveBeenCalled();
    expect(storage.createUpload).not.toHaveBeenCalled();
  });
});

describe('MediaAdminService 업로드 완료', () => {
  it('UPLOADING object를 외부 검사한 뒤 transaction finalization으로 READY 처리한다', async () => {
    const uploading: MediaAsset = {
      ...readyAsset,
      mimeType: null,
      sizeBytes: null,
      sha256: null,
      status: 'UPLOADING',
      readyAt: null,
    };
    const repository = createRepository({
      asset: uploading,
      finalization: { outcome: 'READY', asset: readyAsset },
    });
    const storage = createStorage();
    const service = new MediaAdminService(
      repository,
      storage,
      () => readyAsset.id,
      () => readyAt,
    );

    const result = await service.completeAudioUpload(readyAsset.id, context);

    expect(storage.inspectAndSeal).toHaveBeenCalledWith({
      temporaryStorageKey: `audio/uploads/${readyAsset.id}`,
      finalStorageKey: readyAsset.storageKey,
    });
    expect(repository.finalizeWithAudit).toHaveBeenCalledWith({
      mediaAssetId: readyAsset.id,
      inspection: {
        mimeType: 'audio/mpeg',
        sizeBytes: 3,
        sha256,
      },
      readyAt,
      context,
    });
    expect(result).toBe(readyAsset);
  });

  it('불일치는 REJECTED와 audit을 확정한 결과를 받은 뒤 stable 오류를 던진다', async () => {
    const uploading: MediaAsset = {
      ...readyAsset,
      mimeType: null,
      sizeBytes: null,
      sha256: null,
      status: 'UPLOADING',
      readyAt: null,
    };
    const repository = createRepository({
      asset: uploading,
      finalization: {
        outcome: 'REJECTED',
        asset: {
          ...uploading,
          mimeType: 'audio/ogg',
          sizeBytes: 3,
          sha256,
          status: 'REJECTED',
        },
      },
    });
    const service = new MediaAdminService(
      repository,
      createStorage(),
      () => readyAsset.id,
      () => readyAt,
    );

    await expect(
      service.completeAudioUpload(readyAsset.id, context),
    ).rejects.toMatchObject({ code: 'MEDIA_INSPECTION_MISMATCH' });
    expect(repository.finalizeWithAudit).toHaveBeenCalledTimes(1);
  });

  it('READY 재완료는 object 검사와 update 없이 기존 자산을 반환한다', async () => {
    const repository = createRepository({ asset: readyAsset });
    const storage = createStorage();
    const service = new MediaAdminService(
      repository,
      storage,
      () => readyAsset.id,
    );

    const result = await service.completeAudioUpload(readyAsset.id, context);

    expect(result).toBe(readyAsset);
    expect(storage.inspectAndSeal).not.toHaveBeenCalled();
    expect(repository.finalizeWithAudit).not.toHaveBeenCalled();
  });
});
