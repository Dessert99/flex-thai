/** 사용량·비용 URL filter의 strict parse와 stable 직렬화를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock(
  '@flex-thia/contracts/operations/usage-cost',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@flex-thia/contracts/operations/usage-cost')
    >()),
    usageCostOverviewQuerySchema: z
      .object({
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        source: z.enum(['AI']).optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        status: z
          .enum(['STARTED', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN'])
          .optional(),
      })
      .strict(),
  }),
);

import {
  parseUsageCostSearch,
  serializeUsageCostSearch,
} from './usageCostSearch';

describe('사용량·비용 URL 상태', () => {
  it('strict query를 parse하고 정의된 filter 순서로 직렬화한다', () => {
    expect(
      serializeUsageCostSearch({
        source: 'AI',
        provider: undefined,
        status: 'SUCCEEDED',
      }),
    ).toBe('?source=AI&status=SUCCEEDED');
    expect(() => parseUsageCostSearch({ unexpected: true })).toThrow();
  });
});
