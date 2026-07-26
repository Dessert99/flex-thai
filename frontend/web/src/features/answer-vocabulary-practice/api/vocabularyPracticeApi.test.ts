/** 단어 연습 조회·답안 API의 동적 경로와 strict 계약을 검증한다 */
import {
  vocabularyPracticeAnswerResponseSchema,
  vocabularyPracticeSessionResponseSchema,
  type SubmitVocabularyPracticeAnswerRequest,
  type VocabularyPracticeAnswerResponse,
  type VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerVocabularyPractice } from './answerVocabularyPractice';
import { getVocabularyPracticeSession } from './getVocabularyPracticeSession';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

const ids = {
  session: '00000000-0000-4000-8000-000000000201',
  question: '00000000-0000-4000-8000-000000000202',
  option: '00000000-0000-4000-8000-000000000203',
  vocabulary: '00000000-0000-4000-8000-000000000204',
  meaning: '00000000-0000-4000-8000-000000000205',
} as const;

const session = {
  id: ids.session,
  sourceLabel: '공용 검색',
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

const answerRequest = {
  clientAnswerId: '00000000-0000-4000-8000-000000000206',
  selectedOptionId: ids.option,
} satisfies SubmitVocabularyPracticeAnswerRequest;

const answerResponse = {
  questionId: ids.question,
  selectedOptionId: ids.option,
  selectedLabel: '가다',
  isCorrect: true,
  correctOptionId: ids.option,
  card: {
    id: ids.vocabulary,
    thai: 'ไป',
    kind: 'WORD',
    meanings: [
      {
        id: ids.meaning,
        meaningKo: '가다',
        partOfSpeech: '동사',
        difficulty: 1,
        contextNote: null,
      },
    ],
    pronunciations: [],
    meaningPronunciations: [],
  },
  sessionCompleted: true,
  answeredAt: '2026-07-26T00:01:00.000Z',
} satisfies VocabularyPracticeAnswerResponse;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('단어 연습 세션 조회 API', () => {
  it('세션 ID를 보호된 조회 경로에 넣고 strict 세션 응답을 반환한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(session);

    await expect(getVocabularyPracticeSession(ids.session)).resolves.toBe(
      session,
    );
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      path: `/me/vocabulary-practice/sessions/${ids.session}`,
      response: {
        kind: 'json',
        schema: vocabularyPracticeSessionResponseSchema,
      },
    });
  });
});

describe('단어 연습 답안 API', () => {
  it('세션·문항 ID와 멱등 답안을 보호된 제출 경로로 전달한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(answerResponse);

    await expect(
      answerVocabularyPractice(ids.session, ids.question, answerRequest),
    ).resolves.toBe(answerResponse);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: `/me/vocabulary-practice/sessions/${ids.session}/questions/${ids.question}/answers`,
      body: answerRequest,
      response: {
        kind: 'json',
        schema: vocabularyPracticeAnswerResponseSchema,
      },
    });
  });
});
