/** 사용량·비용 React Query 요청의 path와 settings body를 검증한다 */
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@flex-thia/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flex-thia/contracts')>()),
  usageCostOverviewResponseSchema: z.object({}).passthrough(),
  operationsCostSettingsResponseSchema: z.object({}).passthrough(),
  updateOperationsCostSettingsRequestSchema: z.object({}).passthrough(),
}));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

import {
  updateOperationsCostSettings,
  usageCostOverviewQueryOptions,
  usageCostSettingsQueryOptions,
} from './usageCostQueries';

describe('사용량·비용 query options', () => {
  it('overview filter와 settings endpoint를 정확한 path로 요청한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({});
    const signal = new AbortController().signal;

    const overviewQuery = usageCostOverviewQueryOptions({ source: 'TTS' });
    const settingsQuery = usageCostSettingsQueryOptions();
    if (!overviewQuery.queryFn || !settingsQuery.queryFn) {
      throw new Error('USAGE_COST_QUERY_FUNCTION_MISSING');
    }
    await overviewQuery.queryFn({ signal } as never);
    await settingsQuery.queryFn({ signal } as never);

    expect(mocks.authenticatedRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: '/admin/usage-cost?source=TTS', signal }),
    );
    expect(mocks.authenticatedRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: '/admin/usage-cost/settings', signal }),
    );
  });

  it('settings update는 PUT body와 response schema를 전달한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({});
    const body = {
      warningUsd: '16.000000',
      criticalUsd: '25.000000',
      expectedUpdatedAt: '2026-07-28T00:00:00.000Z',
      requestId: '00000000-0000-4000-8000-000000000001',
    };

    await updateOperationsCostSettings(body);

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/admin/usage-cost/settings',
        body,
      }),
    );
  });
});
