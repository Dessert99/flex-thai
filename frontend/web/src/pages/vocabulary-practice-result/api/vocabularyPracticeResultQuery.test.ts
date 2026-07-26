/** 단어 연습 결과 query의 결과 전용 캐시 키와 세션 조회 연결을 검증한다 */
import type { VocabularyPracticeSessionResponse } from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/shared/test';
import { vocabularyPracticeResultQueryOptions } from './vocabularyPracticeResultQuery';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

const completedSession = {
  id: '00000000-0000-4000-8000-000000000501',
  sourceLabel: 'FLEX 어휘',
  modes: ['THAI_TO_MEANING'],
  questionCount: 1,
  order: 'SOURCE',
  startedAt: '2026-07-26T00:00:00.000Z',
  status: 'COMPLETED',
  completedAt: '2026-07-26T00:01:00.000Z',
  cards: [],
  questions: [],
  answeredQuestionIds: [],
  result: {
    total: { correct: 1, incorrect: 0 },
    byMode: [{ mode: 'THAI_TO_MEANING', correct: 1, incorrect: 0 }],
    incorrectCards: [],
  },
} satisfies VocabularyPracticeSessionResponse;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('단어 연습 결과 query', () => {
  it('일반 세션 캐시와 분리된 결과 키로 같은 세션 API를 조회한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(completedSession);
    const options = vocabularyPracticeResultQueryOptions(completedSession.id);

    await expect(createTestQueryClient().fetchQuery(options)).resolves.toBe(
      completedSession,
    );
    expect(options.queryKey).toEqual([
      'learner',
      'vocabulary-practice',
      'sessions',
      completedSession.id,
      'result',
    ]);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/me/vocabulary-practice/sessions/${completedSession.id}`,
      }),
    );
  });
});
