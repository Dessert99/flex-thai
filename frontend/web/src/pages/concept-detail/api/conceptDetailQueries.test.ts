/** 학습자 개념 상세 query의 식별자별 HTTP 계약을 검증한다 */
import { conceptDetailResponseSchema } from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conceptDetailQueryOptions } from './conceptDetailQueries';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue({});
});

describe('conceptDetailQueryOptions', () => {
  it('개념 ID를 cache key와 상세 path에 함께 반영한다', async () => {
    const conceptId = '11111111-1111-4111-8111-111111111111';
    const options = conceptDetailQueryOptions(conceptId);

    expect(options.queryKey).toEqual([
      'learner',
      'concepts',
      'detail',
      conceptId,
    ]);
    await (options.queryFn as () => Promise<unknown>)();

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      path: `/concepts/${conceptId}`,
      response: { kind: 'json', schema: conceptDetailResponseSchema },
    });
  });
});
