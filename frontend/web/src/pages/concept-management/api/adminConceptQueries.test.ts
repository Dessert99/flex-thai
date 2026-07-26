/** 관리자 개념 목록·생성 API의 strict 요청 계약을 검증한다 */
import {
  adminConceptListResponseSchema,
  conceptVersionResponseSchema,
} from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminConceptListQueryOptions,
  createConcept,
} from './adminConceptQueries';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue({});
});

describe('adminConceptListQueryOptions', () => {
  it('정의된 관리자 필터만 query string과 cache key에 보존한다', async () => {
    const query = {
      category: 'GRAMMAR' as const,
      status: 'HIDDEN' as const,
      page: 2,
      pageSize: 50,
    };
    const options = adminConceptListQueryOptions(query);

    expect(options.queryKey).toEqual(['admin', 'concepts', 'list', query]);
    await (options.queryFn as () => Promise<unknown>)();

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      path: '/admin/concepts?category=GRAMMAR&status=HIDDEN&page=2&pageSize=50',
      response: { kind: 'json', schema: adminConceptListResponseSchema },
    });
  });
});

describe('createConcept', () => {
  it('첫 설명 block을 포함한 생성 payload를 POST한다', async () => {
    const input = {
      category: 'GRAMMAR' as const,
      position: 4,
      title: '수량 표현',
      summary: '태국어 수량 표현을 익힙니다.',
      blocks: [
        {
          kind: 'EXPLANATION' as const,
          position: 0,
          heading: '설명',
          paragraphs: ['명사 뒤에 수량 표현을 둡니다.'],
        },
      ],
    };

    await createConcept(input);

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      body: input,
      method: 'POST',
      path: '/admin/concepts',
      response: { kind: 'json', schema: conceptVersionResponseSchema },
    });
  });

  it('공백 제목처럼 계약에 맞지 않는 payload는 요청 전에 거부한다', () => {
    expect(() =>
      createConcept({
        category: 'GRAMMAR',
        position: 0,
        title: ' ',
        summary: '요약',
        blocks: [
          {
            kind: 'EXPLANATION',
            position: 0,
            heading: '설명',
            paragraphs: ['본문'],
          },
        ],
      }),
    ).toThrow();
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
  });
});
