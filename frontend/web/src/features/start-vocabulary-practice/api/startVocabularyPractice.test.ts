/** 단어 연습 생성 API의 인증 경로·요청 본문·세션 ID 반환을 검증한다 */
import {
  vocabularyPracticeSessionResponseSchema,
  type CreateVocabularyPracticeRequest,
  type VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startVocabularyPractice } from './startVocabularyPractice';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

const request = {
  source: {
    type: 'WORDBOOK',
    wordbookId: '00000000-0000-4000-8000-000000000101',
  },
  modes: ['THAI_TO_MEANING'],
  questionCount: 10,
  order: 'RANDOM',
} satisfies CreateVocabularyPracticeRequest;

const session = {
  id: '00000000-0000-4000-8000-000000000102',
  sourceLabel: 'FLEX 어휘',
  modes: ['THAI_TO_MEANING'],
  questionCount: 1,
  order: 'RANDOM',
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

describe('단어 연습 생성 API', () => {
  it('설정 본문을 보호된 생성 경로로 보내고 응답의 세션 ID를 반환한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(session);

    await expect(startVocabularyPractice(request)).resolves.toBe(session.id);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/me/vocabulary-practice/sessions',
      body: request,
      response: {
        kind: 'json',
        schema: vocabularyPracticeSessionResponseSchema,
      },
    });
  });
});
