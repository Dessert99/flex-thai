/** 관리자 홈 DB 집계가 전체 상태를 filter/count하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleAdminHomeQuery } from './drizzle-admin-home.query.js';

describe('DrizzleAdminHomeQuery', () => {
  it('집계 행이 없으면 모든 수치를 0으로 반환한다', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue([]),
    };

    await expect(
      new DrizzleAdminHomeQuery(database).getOperationsSummary(
        '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
      ),
    ).resolves.toEqual({
      pendingErrorReportCount: 0,
      pendingVocabularyCandidateCount: 0,
      runningContentJobCount: 0,
      failedContentJobCount: 0,
      recentVerificationAt: null,
    });
  });
});
