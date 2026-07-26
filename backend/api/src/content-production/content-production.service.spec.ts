/** 콘텐츠 제작 HTTP application 계층의 upload·preset 검증을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import type { CreateContentProductionCommand } from '@flex-thia/domain';
import {
  ContentProductionApplicationError,
  ContentProductionApplicationService,
} from './content-production.service.js';

const ownerId = '8f47b4d5-97d6-4596-af72-16456be51be8';
const uploadId = '77a1e8ff-7c85-4739-9004-647e12e34b65';
const presetId = '405986f9-e552-4ce1-82d6-70a1fc460f96';

const createService = (options?: {
  uploads?: unknown[];
  presetPurpose?: 'VOCABULARY_EXTRACTION' | 'QUESTION_GENERATION';
}) => {
  const create = vi
    .fn<(command: CreateContentProductionCommand) => Promise<{ id: string }>>()
    .mockResolvedValue({ id: 'job-id' });
  const service = new ContentProductionApplicationService(
    {
      findVerifiedOwnedByIds: vi.fn().mockResolvedValue(
        options?.uploads ?? [
          {
            uploadId,
            inputType: 'PDF',
            inputKey: 'inputs/private.pdf',
            sizeBytes: 1024,
          },
        ],
      ),
    },
    {
      findEnabledById: vi.fn().mockResolvedValue({
        id: presetId,
        name: '기본 생성',
        purpose: options?.presetPurpose ?? 'QUESTION_GENERATION',
        version: 1,
        parameters: { language: 'th' },
      }),
      listEnabled: vi.fn().mockResolvedValue([]),
    },
    {
      create,
      getOwned: vi.fn(),
      listOwned: vi.fn(),
      retry: vi.fn(),
    } as never,
  );
  return { service, create };
};

describe('ContentProductionApplicationService 입력 조립', () => {
  it('소유하고 검증된 upload와 같은 목적 preset snapshot만 도메인에 전달한다', async () => {
    const { service, create } = createService();

    await service.create(ownerId, {
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      purpose: 'QUESTION_GENERATION',
      presetId,
      uploadIds: [uploadId],
    });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      requestedBy: ownerId,
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      purpose: 'QUESTION_GENERATION',
      presetSnapshot: { id: presetId, version: 1 },
      inputs: [
        {
          uploadId,
          inputType: 'PDF',
          sizeBytes: 1024,
        },
      ],
    });
  });

  it('누락 upload과 다른 목적 preset을 stable application 오류로 거절한다', async () => {
    const missing = createService({ uploads: [] }).service;
    await expect(
      missing.create(ownerId, {
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'QUESTION_GENERATION',
        presetId,
        uploadIds: [uploadId],
      }),
    ).rejects.toEqual(
      new ContentProductionApplicationError('UPLOAD_NOT_VERIFIED'),
    );

    const mismatch = createService({
      presetPurpose: 'VOCABULARY_EXTRACTION',
    }).service;
    await expect(
      mismatch.create(ownerId, {
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'QUESTION_GENERATION',
        presetId,
        uploadIds: [uploadId],
      }),
    ).rejects.toEqual(
      new ContentProductionApplicationError('PRESET_NOT_AVAILABLE'),
    );
  });
});
