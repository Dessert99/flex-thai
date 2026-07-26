/** 로컬 upload provider가 선언 metadata로 서버측 완료 검사를 재현하는지 검증한다 */
import { UploadPolicyService } from '@flex-thia/domain';
import { describe, expect, it } from 'vitest';
import { FakeUploadProvider } from './fake-upload.provider.js';
import { FakeUploadRepository } from './fake-upload.repository.js';

describe('FakeUploadProvider local 완료', () => {
  it('정책 발급 시 검증된 선언 metadata를 준비해 upload을 VERIFIED로 완료한다', async () => {
    const repository = new FakeUploadRepository();
    const storage = new FakeUploadProvider();
    const service = new UploadPolicyService(
      repository,
      storage,
      () => 'ac8a5750-4af2-4c8f-812a-eb445831fd82',
    );

    const policy = await service.createPolicy({
      ownerId: 'e6c36fe5-d7e8-4d6d-8290-b7accd82a88c',
      inputType: 'TEXT',
      contentType: 'text/plain',
      declaredSizeBytes: 128,
    });
    const completed = await service.complete(
      'e6c36fe5-d7e8-4d6d-8290-b7accd82a88c',
      policy.uploadId,
    );

    expect(completed).toMatchObject({
      inputType: 'TEXT',
      declaredContentType: 'text/plain',
      sizeBytes: 128,
      status: 'VERIFIED',
    });
  });
});
