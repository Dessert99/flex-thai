/** upload object key의 owner를 body가 아니라 인증 사용자로 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { UploadsController } from './uploads.controller.js';

describe('UploadsController', () => {
  it('인증 사용자 id를 policy use case에 넣는다', async () => {
    const createPolicy = vi.fn().mockResolvedValue({});
    const controller = new UploadsController({
      createPolicy,
      complete: vi.fn(),
    } as never);

    await controller.createPolicy(
      {
        userId: 'user-id',
        sub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        mfaEnrolledAt: new Date('2026-07-23T00:00:00.000Z'),
      },
      {
        inputType: 'PDF',
        contentType: 'application/pdf',
        declaredSizeBytes: 1024,
      },
    );

    expect(createPolicy).toHaveBeenCalledWith({
      ownerId: 'user-id',
      inputType: 'PDF',
      contentType: 'application/pdf',
      declaredSizeBytes: 1024,
    });
  });
});
