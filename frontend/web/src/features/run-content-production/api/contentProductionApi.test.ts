/** 콘텐츠 제작 API의 UUID command와 query key 경계를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedRequest } from '@/shared/api';
import {
  contentProductionJobsQueryOptions,
  createContentProductionJob,
} from './contentProductionApi';

vi.mock('@/shared/api', () => ({ authenticatedRequest: vi.fn() }));

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

describe('contentProductionApi', () => {
  beforeEach(() => vi.mocked(authenticatedRequest).mockReset());

  it('최근 작업 limit을 query key와 요청 경로에 함께 고정한다', () => {
    const options = contentProductionJobsQueryOptions(7);
    expect(options.queryKey).toEqual([
      'admin',
      'content-production',
      'jobs',
      7,
    ]);
  });

  it('검증된 strict command만 작업 생성 요청으로 전달한다', () => {
    void createContentProductionJob({
      clientRequestId: id(1),
      purpose: 'VOCABULARY_EXTRACTION',
      presetId: id(2),
      uploadIds: [id(3)],
      options: {},
    });
    expect(authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/admin/content-production/jobs',
        body: expect.objectContaining({ clientRequestId: id(1) }),
      }),
    );
  });
});
