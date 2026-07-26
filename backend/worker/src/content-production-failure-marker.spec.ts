/** 최종 failure marker가 현재 attempt만 실패 처리하는 조립 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { createContentProductionFailureMarkerHandler } from './content-production-failure-marker.js';

describe('콘텐츠 제작 failure marker Lambda', () => {
  it('현재 RUNNING attempt를 terminal FAILED로 반환한다', async () => {
    const failAttempt = vi.fn().mockResolvedValue({
      jobId: '00000000-0000-4000-8000-000000000001',
      status: 'FAILED',
    });
    const handler = createContentProductionFailureMarkerHandler({
      failAttempt,
    });

    await expect(
      handler({ jobId: '00000000-0000-4000-8000-000000000001', attempt: 1 }),
    ).resolves.toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
      status: 'FAILED',
    });
    expect(failAttempt).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      1,
      'CONTENT_PRODUCTION_WORKFLOW_FAILURE',
    );
  });

  it('최신 attempt나 terminal 상태면 stale marker를 무시한다', async () => {
    const handler = createContentProductionFailureMarkerHandler({
      failAttempt: vi.fn().mockResolvedValue(null),
    });

    await expect(
      handler({ jobId: '00000000-0000-4000-8000-000000000001', attempt: 1 }),
    ).resolves.toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
      status: 'IGNORED',
    });
  });
});
