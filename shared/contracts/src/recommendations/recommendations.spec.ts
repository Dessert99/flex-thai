/** 개인 추천 응답의 모드·이유·내부 점수 비노출 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import { recommendationResponseSchema } from './recommendations.js';

const response = {
  mode: 'PERSONALIZED',
  meaningfulSignalCount: 5,
  activationThreshold: 5,
  publishedToday: {
    vocabularies: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57ab0',
        thai: 'วันนี้',
        kind: 'WORD',
        publishedAt: '2026-07-31T02:00:00.000Z',
      },
    ],
  },
  newContent: {
    vocabularies: [],
  },
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
  it('개인화 모드와 오늘·NEW·추천 콘텐츠를 허용한다', () => {
    expect(recommendationResponseSchema.parse(response)).toEqual(response);
  });

  it('fallback 이유와 빈 추천 목록을 허용한다', () => {
    expect(
      recommendationResponseSchema.parse({
        ...response,
        mode: 'FALLBACK',
        meaningfulSignalCount: 0,
        publishedToday: { vocabularies: [] },
        newContent: { vocabularies: [] },
        vocabularies: [],
      }),
    ).toMatchObject({ mode: 'FALLBACK', meaningfulSignalCount: 0 });
  });

  it('내부 추천 점수를 공개 응답에 허용하지 않는다', () => {
    expect(() =>
      recommendationResponseSchema.parse({
        ...response,
        vocabularies: [{ ...response.vocabularies[0], score: 100 }],
      }),
    ).toThrow();
  });

  it('오늘 게시와 NEW 콘텐츠에 공개 시각이 없으면 거절한다', () => {
    expect(() =>
      recommendationResponseSchema.parse({
        ...response,
        publishedToday: {
          vocabularies: [
            { id: response.vocabularies[0].id, thai: 'วันนี้', kind: 'WORD' },
          ],
        },
      }),
    ).toThrow();
  });
});
