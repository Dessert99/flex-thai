/** 관리자 개념 상세 query의 UUID 검증과 HTTP 계약을 검증한다 */
import { adminConceptDetailResponseSchema } from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminConceptDetailQueryOptions } from './adminConceptDetailQueries';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue({});
});

describe('adminConceptDetailQueryOptions', () => {
  it('검증한 개념 ID를 관리자 cache key와 상세 path에 사용한다', async () => {
    const conceptId = '11111111-1111-4111-8111-111111111111';
    const options = adminConceptDetailQueryOptions(conceptId);

    expect(options.queryKey).toEqual([
      'admin',
      'concepts',
      'detail',
      conceptId,
    ]);
    await (options.queryFn as () => Promise<unknown>)();

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      path: `/admin/concepts/${conceptId}`,
      response: { kind: 'json', schema: adminConceptDetailResponseSchema },
    });
  });

  it('UUID가 아닌 개념 ID는 query 생성 전에 거부한다', () => {
    expect(() => adminConceptDetailQueryOptions('concept-1')).toThrow();
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
  });
});
