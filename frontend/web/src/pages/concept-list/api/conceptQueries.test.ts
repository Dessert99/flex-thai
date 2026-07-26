/** 학습자 개념 목록 query의 cache key와 HTTP 계약을 검증한다 */
import { conceptListResponseSchema } from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conceptListQueryOptions } from './conceptQueries';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue({ items: [] });
});

describe('conceptListQueryOptions', () => {
  it('선택한 영역을 cache key와 목록 query에 함께 반영한다', async () => {
    const options = conceptListQueryOptions('THAI_SCRIPT_PRONUNCIATION');

    expect(options.queryKey).toEqual([
      'learner',
      'concepts',
      'list',
      'THAI_SCRIPT_PRONUNCIATION',
    ]);
    await (options.queryFn as () => Promise<unknown>)();

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      path: '/concepts?category=THAI_SCRIPT_PRONUNCIATION',
      response: { kind: 'json', schema: conceptListResponseSchema },
    });
  });
});
