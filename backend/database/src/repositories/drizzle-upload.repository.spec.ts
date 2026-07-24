/** upload 완료가 PENDING 조건과 실제 S3 size를 함께 저장하게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { uploads } from '../schema/index.js';
import { DrizzleUploadRepository } from './drizzle-upload.repository.js';

describe('DrizzleUploadRepository', () => {
  it('VERIFIED 전이는 실제 size와 verifiedAt을 한 update에 넣는다', async () => {
    const row = {
      id: 'upload-id',
      ownerId: 'user-id',
      inputType: 'PDF',
      objectKey: 'inputs/user-id/upload-id',
      declaredContentType: 'application/pdf',
      sizeBytes: 1024,
      status: 'VERIFIED',
      verifiedAt: new Date('2026-07-17T00:00:00.000Z'),
      createdAt: new Date('2026-07-17T00:00:00.000Z'),
    };
    const returning = vi.fn().mockResolvedValue([row]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn((table: unknown) => {
      expect(table).toBe(uploads);
      return { set };
    });
    const repository = new DrizzleUploadRepository({ update } as never);

    await repository.markVerified(
      'upload-id',
      1024,
      new Date('2026-07-17T00:00:00.000Z'),
    );

    expect(set).toHaveBeenCalledWith({
      sizeBytes: 1024,
      status: 'VERIFIED',
      verifiedAt: new Date('2026-07-17T00:00:00.000Z'),
    });
    expect(where).toHaveBeenCalledTimes(1);
  });
});
