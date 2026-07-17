/** S3 호출 전 크기 제한과 완료 시 실제 파일 검증을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { UploadPolicyService } from './upload-policy.service.js';

describe('UploadPolicyService', () => {
  it('25MB를 1 byte라도 넘으면 repository와 S3를 호출하지 않는다', async () => {
    const repository = {
      createPending: vi.fn(),
      findOwnedById: vi.fn(),
      markVerified: vi.fn(),
      markRejected: vi.fn(),
      findVerifiedOwnedByIds: vi.fn(),
    };
    const storage = {
      createPolicy: vi.fn(),
      inspectObject: vi.fn(),
    };
    const service = new UploadPolicyService(
      repository,
      storage,
      () => '77a1e8ff-7c85-4739-9004-647e12e34b65',
    );

    await expect(
      service.createPolicy({
        ownerId: 'user-id',
        inputType: 'PDF',
        contentType: 'application/pdf',
        declaredSizeBytes: 25 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });

    expect(repository.createPending).not.toHaveBeenCalled();
    expect(storage.createPolicy).not.toHaveBeenCalled();
  });

  it('암호화 PDF는 VERIFIED로 바꾸지 않고 REJECTED로 종료한다', async () => {
    const repository = {
      createPending: vi.fn(),
      findOwnedById: vi.fn().mockResolvedValue({
        id: '77a1e8ff-7c85-4739-9004-647e12e34b65',
        ownerId: 'user-id',
        inputType: 'PDF',
        objectKey: 'inputs/user-id/77a1e8ff-7c85-4739-9004-647e12e34b65',
        declaredContentType: 'application/pdf',
        sizeBytes: null,
        status: 'PENDING',
      }),
      markVerified: vi.fn(),
      markRejected: vi.fn().mockResolvedValue(undefined),
      findVerifiedOwnedByIds: vi.fn(),
    };
    const storage = {
      createPolicy: vi.fn(),
      inspectObject: vi.fn().mockResolvedValue({
        sizeBytes: 1024,
        contentType: 'application/pdf',
        detectedType: 'PDF',
        encryptedPdf: true,
        pdfPageCount: null,
      }),
    };
    const service = new UploadPolicyService(
      repository,
      storage,
      () => 'unused',
    );

    await expect(
      service.complete('user-id', '77a1e8ff-7c85-4739-9004-647e12e34b65'),
    ).rejects.toMatchObject({ code: 'ENCRYPTED_PDF_NOT_ALLOWED' });

    expect(repository.markRejected).toHaveBeenCalledTimes(1);
    expect(repository.markVerified).not.toHaveBeenCalled();
  });
});
