/** AI·TTS 비용 query가 안전한 aggregate만 조립하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { DrizzleUsageCostOperationsQuery } from './drizzle-usage-cost-operations.query.js';

const range = {
  from: new Date('2026-07-01T00:00:00.000Z'),
  to: new Date('2026-08-01T00:00:00.000Z'),
};

const createDatabase = (rows: unknown[][]) => {
  const queued = [...rows];
  const calls: unknown[] = [];
  return {
    calls,
    database: {
      execute: (query: unknown) => {
        calls.push(query);
        return Promise.resolve({ rows: queued.shift() ?? [] });
      },
    },
  };
};

describe('DrizzleUsageCostOperationsQuery', () => {
  it('AI·TTS provider run을 안전한 breakdown과 decimal 문자열로 조립한다', async () => {
    const fake = createDatabase([
      [{ estimated_cost_usd: '3.250000' }],
      [
        {
          source: 'AI',
          provider: 'local',
          model: 'deterministic-v1',
          voice: null,
          run_count: 2,
          estimated_cost_usd: '1.250000',
        },
        {
          source: 'TTS',
          provider: 'local',
          model: 'deterministic-v1',
          voice: 'thai-female',
          run_count: 1,
          estimated_cost_usd: '2.000000',
        },
      ],
      [{ in_progress_job_count: 2 }],
      [{ failed_run_count: 1 }],
      [{ pending_review_candidate_count: 4 }],
    ]);
    const query = new DrizzleUsageCostOperationsQuery(fake.database);

    await expect(query.getOverview({ range })).resolves.toEqual({
      estimatedCostUsd: '3.250000',
      inProgressJobCount: 2,
      failedRunCount: 1,
      pendingReviewCandidateCount: 4,
      breakdown: [
        {
          source: 'AI',
          provider: 'local',
          model: 'deterministic-v1',
          voice: null,
          runCount: 2,
          estimatedCostUsd: '1.250000',
        },
        {
          source: 'TTS',
          provider: 'local',
          model: 'deterministic-v1',
          voice: 'thai-female',
          runCount: 1,
          estimatedCostUsd: '2.000000',
        },
      ],
    });
    expect(fake.calls).toHaveLength(5);
  });

  it('현재 월 비용은 breakdown filter 없이 별도 읽기에서 문자열로 보존한다', async () => {
    const fake = createDatabase([[{ estimated_cost_usd: '16.000000' }]]);
    const query = new DrizzleUsageCostOperationsQuery(fake.database);

    await expect(query.getCurrentMonthEstimatedCost(range)).resolves.toBe(
      '16.000000',
    );
    expect(fake.calls).toHaveLength(1);
  });

  it('예상한 scalar가 아닌 DB 값을 문자열로 숨기지 않고 거절한다', async () => {
    const fake = createDatabase([
      [{ estimated_cost_usd: '1.000000' }],
      [
        {
          source: 'AI',
          provider: {},
          model: 'deterministic-v1',
          voice: null,
          run_count: 1,
          estimated_cost_usd: '1.000000',
        },
      ],
      [{ in_progress_job_count: 0 }],
      [{ failed_run_count: 0 }],
      [{ pending_review_candidate_count: 0 }],
    ]);
    const query = new DrizzleUsageCostOperationsQuery(fake.database);

    await expect(query.getOverview({ range })).rejects.toThrow(
      'USAGE_COST_ROW_VALUE_INVALID',
    );
  });
});
