/** terminal challenge를 되돌리지 않는 조건부 update 경계를 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { authChallenges, users } from '../schema/index.js';
import { DrizzleAuthChallengeRepository } from './drizzle-auth-challenge.repository.js';
import { DrizzleUserRepository } from './drizzle-user.repository.js';

describe('DrizzleAuthChallengeRepository', () => {
  it('상태 전이는 update 뒤 where 조건과 returning을 반드시 사용한다', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'challenge-id' }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn((table: unknown) => {
      expect(table).toBe(authChallenges);
      return { set };
    });
    const repository = new DrizzleAuthChallengeRepository({
      update,
    } as never);

    await expect(
      repository.transition('challenge-id', 'SUCCEEDED'),
    ).resolves.toBe(true);

    expect(set).toHaveBeenCalledWith({ status: 'SUCCEEDED' });
    expect(where).toHaveBeenCalledTimes(1);
    expect(returning).toHaveBeenCalledTimes(1);
  });
});

describe('DrizzleUserRepository', () => {
  it('TOTP 등록 완료 시각과 사용자 수정 시각을 함께 갱신한다', async () => {
    const enrolledAt = new Date('2026-07-23T00:00:00.000Z');
    const returning = vi.fn().mockResolvedValue([
      {
        id: 'user-id',
        cognitoSub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        phoneVerifiedAt: null,
        mfaEnrolledAt: enrolledAt,
        createdAt: enrolledAt,
        updatedAt: enrolledAt,
      },
    ]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn((table: unknown) => {
      expect(table).toBe(users);
      return { set };
    });
    const repository = new DrizzleUserRepository({ update } as never);

    await repository.markMfaEnrolled('cognito-sub', enrolledAt);

    expect(set).toHaveBeenCalledWith({
      mfaEnrolledAt: enrolledAt,
      updatedAt: enrolledAt,
    });
    expect(where).toHaveBeenCalledTimes(1);
    expect(returning).toHaveBeenCalledTimes(1);
  });
});
