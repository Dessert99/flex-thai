/** 인증 사용자가 다른 사용자의 Job을 만들 수 없게 Controller 경계를 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { JobsController } from './jobs.controller.js';

describe('JobsController', () => {
  it('인증에서 얻은 사용자 id를 Job 생성 command에 넣는다', async () => {
    const create = vi.fn().mockResolvedValue({
      id: '405986f9-e552-4ce1-82d6-70a1fc460f96',
      status: 'QUEUED',
      attempt: 0,
      createdAt: new Date('2026-07-17T00:00:00.000Z'),
    });
    const controller = new JobsController({ create } as never);

    await controller.create(
      {
        userId: '8f47b4d5-97d6-4596-af72-16456be51be8',
        sub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        mfaEnrolledAt: new Date('2026-07-23T00:00:00.000Z'),
      },
      {
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        type: 'VOCAB_IMPORT',
        uploadIds: ['77a1e8ff-7c85-4739-9004-647e12e34b65'],
      },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
      }),
    );
  });
});
