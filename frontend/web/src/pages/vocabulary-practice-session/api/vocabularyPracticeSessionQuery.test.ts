/** 단어 연습 세션 query의 세션별 캐시 분리와 조회 연결을 검증한다 */
import type { VocabularyPracticeSessionResponse } from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/shared/test';
import { vocabularyPracticeSessionQueryOptions } from './vocabularyPracticeSessionQuery';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

const session = {
  id: '00000000-0000-4000-8000-000000000401',
  sourceLabel: 'FLEX 어휘',
  modes: ['THAI_TO_MEANING'],
  questionCount: 1,
  order: 'SOURCE',
  startedAt: '2026-07-26T00:00:00.000Z',
  status: 'ACTIVE',
  completedAt: null,
  cards: [],
  questions: [],
  answeredQuestionIds: [],
} satisfies VocabularyPracticeSessionResponse;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('단어 연습 세션 query', () => {
  it('세션 ID를 캐시 키와 실제 조회 경로에 함께 사용한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(session);
    const options = vocabularyPracticeSessionQueryOptions(session.id);

    await expect(createTestQueryClient().fetchQuery(options)).resolves.toBe(
      session,
    );
    expect(options.queryKey).toEqual([
      'learner',
      'vocabulary-practice',
      'sessions',
      session.id,
    ]);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/me/vocabulary-practice/sessions/${session.id}`,
      }),
    );
  });
});
