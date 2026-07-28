/** 후보 bulk worker pool의 concurrency·순서·부분 실패를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCandidateBulkAction } from './runCandidateBulkAction';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  discard: vi.fn(),
  regenerate: vi.fn(),
}));

vi.mock('../api/questionCandidateApi', () => ({
  approveQuestionCandidate: mocks.approve,
  discardQuestionCandidate: mocks.discard,
  regenerateQuestionCandidate: mocks.regenerate,
}));

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

describe('후보 bulk action', () => {
  it('동시에 네 요청만 실행하고 입력 순서대로 부분 실패를 반환한다', async () => {
    let active = 0;
    let maximum = 0;
    mocks.approve.mockImplementation(async (candidateId: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      if (candidateId.endsWith('5')) throw new Error('실패');
    });
    const selected = Array.from({ length: 8 }, (_, index) => ({
      candidateId: `00000000-0000-4000-8000-00000000000${index}`,
      revision: index,
    }));

    const results = await runCandidateBulkAction(selected, 'APPROVE');

    expect(maximum).toBeLessThanOrEqual(4);
    expect(results.map(({ candidateId }) => candidateId)).toEqual(
      selected.map(({ candidateId }) => candidateId),
    );
    expect(results[5]).toMatchObject({ status: 'FAILED' });
    expect(results.filter(({ status }) => status === 'SUCCEEDED')).toHaveLength(
      7,
    );
  });
});
