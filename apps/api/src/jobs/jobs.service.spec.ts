/** 검증된 S3 object의 실제 크기만 Job 입력에 반영하는 service 테스트 */
import { describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service.js';

const requestedBy = '8f47b4d5-97d6-4596-af72-16456be51be8';
const clientRequestId = 'dbb22737-6f3d-4112-bb0e-8e4f005c810b';

describe('JobsService', () => {
  it('검증된 upload의 실제 합계가 250MB를 넘으면 Job을 만들지 않는다', async () => {
    const records = Array.from({ length: 11 }, (_, index) => ({
      uploadId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      inputType: 'PDF' as const,
      inputKey: `inputs/owner/${index}.pdf`,
      sizeBytes: 25 * 1024 * 1024,
    }));
    const uploads = {
      findVerifiedOwnedByIds: vi.fn().mockResolvedValue(records),
    };
    const createJob = { execute: vi.fn() };
    const service = new JobsService(uploads, createJob as never, {} as never);

    await expect(
      service.create({
        requestedBy,
        clientRequestId,
        type: 'VOCAB_IMPORT',
        uploadIds: records.map((record) => record.uploadId),
      }),
    ).rejects.toMatchObject({ code: 'JOB_INPUT_TOO_LARGE' });

    expect(createJob.execute).not.toHaveBeenCalled();
  });

  it('소유하거나 검증한 upload가 하나라도 없으면 존재 여부를 숨긴다', async () => {
    const uploads = {
      findVerifiedOwnedByIds: vi.fn().mockResolvedValue([]),
    };
    const createJob = { execute: vi.fn() };
    const service = new JobsService(uploads, createJob as never, {} as never);

    await expect(
      service.create({
        requestedBy,
        clientRequestId,
        type: 'VOCAB_IMPORT',
        uploadIds: ['77a1e8ff-7c85-4739-9004-647e12e34b65'],
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_VERIFIED' });

    expect(createJob.execute).not.toHaveBeenCalled();
  });
});
