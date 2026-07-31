/** 관리자 홈 DB 집계가 전체 상태를 filter/count하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleAdminHomeQuery } from './drizzle-admin-home.query.js';

describe('DrizzleAdminHomeQuery', () => {
  it('오류 신고·두 후보·콘텐츠·TTS 상태를 단일 안전 집계로 반환한다', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue({
        rows: [
          {
            pendingErrorReportCount: '2',
            pendingQuestionCandidateCount: '3',
            pendingVocabularyCandidateCount: '4',
            runningContentJobCount: '5',
            failedContentJobCount: '6',
            runningTtsJobCount: '7',
            failedTtsJobCount: '8',
          },
        ],
      }),
    };

    await expect(
      new DrizzleAdminHomeQuery(database).getOperationsSummary(),
    ).resolves.toEqual({
      pendingErrorReportCount: 2,
      pendingQuestionCandidateCount: 3,
      pendingVocabularyCandidateCount: 4,
      runningContentJobCount: 5,
      failedContentJobCount: 6,
      runningTtsJobCount: 7,
      failedTtsJobCount: 8,
    });
    expect(database.execute).toHaveBeenCalledOnce();
  });

  it('집계 행이 없으면 모든 수치를 0으로 반환한다', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue([]),
    };

    await expect(
      new DrizzleAdminHomeQuery(database).getOperationsSummary(),
    ).resolves.toEqual({
      pendingErrorReportCount: 0,
      pendingQuestionCandidateCount: 0,
      pendingVocabularyCandidateCount: 0,
      runningContentJobCount: 0,
      failedContentJobCount: 0,
      runningTtsJobCount: 0,
      failedTtsJobCount: 0,
    });
  });
});
