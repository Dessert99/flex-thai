/** 개인 추천 응답의 모드·이유·내부 점수 비노출 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  questionRecommendationReasonCodeSchema,
  recommendationResponseSchema,
  vocabularyRecommendationReasonCodeSchema,
} from './recommendations.js';

const response = {
  mode: 'PERSONALIZED',
  meaningfulSignalCount: 5,
  activationThreshold: 5,
  questions: [
    {
      questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
      questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
      questionType: {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        slug: 'reading-context',
        displayName: '문맥에 맞는 표현',
      },
      skill: 'READING',
      difficulty: 2,
      reasonCode: 'SAVED_QUESTION',
      reason: '저장한 문제예요.',
    },
  ],
  vocabularies: [
    {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
      thai: 'สวัสดี',
      kind: 'WORD',
      reasonCode: 'IN_WORDBOOK',
      reason: '내 단어장에 담긴 어휘예요.',
    },
  ],
} as const;

describe('개인 추천 공개 계약', () => {
  it('개인화 모드와 문제·어휘 추천 이유를 허용한다', () => {
    expect(recommendationResponseSchema.parse(response)).toEqual(response);
  });

  it('fallback 이유와 빈 추천 목록을 허용한다', () => {
    expect(
      recommendationResponseSchema.parse({
        ...response,
        mode: 'FALLBACK',
        meaningfulSignalCount: 0,
        questions: [],
        vocabularies: [],
      }),
    ).toMatchObject({ mode: 'FALLBACK', meaningfulSignalCount: 0 });
  });

  it('내부 추천 점수를 공개 응답에 허용하지 않는다', () => {
    expect(() =>
      recommendationResponseSchema.parse({
        ...response,
        questions: [{ ...response.questions[0], score: 40 }],
      }),
    ).toThrow();
  });

  it('승인된 문제·어휘 추천 reason code만 허용한다', () => {
    expect(questionRecommendationReasonCodeSchema.options).toEqual([
      'RECENTLY_PUBLISHED',
      'SAVED_QUESTION',
      'FIRST_INCORRECT_RETRY',
      'PRACTICE_MISSED_VOCABULARY',
      'SIMILAR_QUESTION_TYPE',
      'SAVED_QUESTION_VOCABULARY',
    ]);
    expect(vocabularyRecommendationReasonCodeSchema.options).toEqual([
      'RECENTLY_PUBLISHED',
      'IN_WORDBOOK',
      'PRACTICE_INCORRECT',
      'FIRST_INCORRECT_QUESTION_VOCABULARY',
      'SAVED_QUESTION_VOCABULARY',
    ]);
  });
});
