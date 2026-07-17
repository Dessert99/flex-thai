/** step-up grant가 사용자·action·만료에 함께 묶이게 고정한다 */
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RequireStepUpGuard } from './require-step-up.guard.js';

describe('RequireStepUpGuard', () => {
  it('다른 action의 유효 token은 현재 민감 작업에 재사용할 수 없다', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('AI_BULK_CREATE'),
    };
    const grants = {
      findActiveGrants: vi.fn().mockResolvedValue([
        {
          actionCategory: 'CONTENT_PUBLISH',
          tokenHmac: 'stored',
          expiresAt: new Date('2026-07-17T00:10:00.000Z'),
        },
      ]),
    };
    const crypto = { verifyAnswer: vi.fn().mockReturnValue(true) };
    const guard = new RequireStepUpGuard(
      reflector as unknown as Reflector,
      grants as never,
      crypto as never,
      () => new Date('2026-07-17T00:00:00.000Z'),
    );
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'user-id' },
          headers: { 'x-step-up-token': 'raw-token' },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      status: 403,
    });
  });
});
