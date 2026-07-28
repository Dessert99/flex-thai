/** 사용량·비용 controller의 관리자 guard와 요청 전달을 검증한다 */
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminUsageCostOperationsController } from './admin-usage-cost-operations.controller.js';

vi.mock('@flex-thia/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flex-thia/contracts')>()),
  usageCostOverviewQuerySchema: z
    .object({ source: z.enum(['AI', 'TTS']).optional() })
    .strict(),
  updateOperationsCostSettingsRequestSchema: z
    .object({
      warningUsd: z.string(),
      criticalUsd: z.string(),
      expectedUpdatedAt: z.iso.datetime(),
      requestId: z.uuid(),
    })
    .strict(),
  usageCostOverviewResponseSchema: z.object({}).passthrough(),
  operationsCostSettingsResponseSchema: z.object({}).passthrough(),
}));

const admin = {
  userId: '00000000-0000-4000-8000-000000000001',
  sub: 'admin-sub',
  email: 'admin@hufs.ac.kr',
  role: 'ADMIN' as const,
  mfaEnrolledAt: new Date(),
};

describe('AdminUsageCostOperationsController', () => {
  it('class 전체에 Bearer·ADMIN·MFA guard를 적용한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminUsageCostOperationsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(
        REQUIRED_ROLE_KEY,
        AdminUsageCostOperationsController,
      ),
    ).toBe('ADMIN');
  });

  it('overview filter와 settings actor·request를 service에 전달한다', async () => {
    const service = {
      overview: vi.fn().mockResolvedValue({ estimatedCostUsd: '0' }),
      settings: vi.fn().mockResolvedValue({ currency: 'USD' }),
      updateSettings: vi.fn().mockResolvedValue({ currency: 'USD' }),
    };
    const controller = new AdminUsageCostOperationsController(service as never);
    const body = {
      warningUsd: '16.000000',
      criticalUsd: '25.000000',
      expectedUpdatedAt: '2026-07-28T00:00:00.000Z',
      requestId: '00000000-0000-4000-8000-000000000002',
    };

    await controller.overview(admin, { source: 'TTS' });
    await controller.settings(admin);
    await controller.updateSettings(admin, body);

    expect(service.overview).toHaveBeenCalledWith(
      { role: 'ADMIN' },
      { source: 'TTS' },
    );
    expect(service.settings).toHaveBeenCalledWith({ role: 'ADMIN' });
    expect(service.updateSettings).toHaveBeenCalledWith(
      {
        role: 'ADMIN',
        userId: admin.userId,
        sub: admin.sub,
      },
      body,
    );
  });
});
