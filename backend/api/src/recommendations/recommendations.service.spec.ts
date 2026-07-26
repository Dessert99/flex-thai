/** 추천 query 결과의 strict 공개 변환과 사용자 전달을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  RecommendationPublicResponseError,
  RecommendationsService,
} from './recommendations.service.js';

const validResult = {
  mode: 'FALLBACK',
  meaningfulSignalCount: 0,
  activationThreshold: 5,
  questions: [],
  vocabularies: [],
} satisfies Awaited<
  ReturnType<
    import('@flex-thia/database').DrizzleRecommendationQuery['getForUser']
  >
>;

describe('RecommendationsService', () => {
  it('인증 사용자의 추천을 strict 공개 응답으로 반환한다', async () => {
    const service = new RecommendationsService({
      getForUser: vi.fn().mockResolvedValue(validResult),
    });

    await expect(
      service.getForUser('00000000-0000-4000-8000-000000000901'),
    ).resolves.toEqual(validResult);
  });

  it('query가 내부 필드를 섞으면 공개 응답 변환을 거절한다', async () => {
    const service = new RecommendationsService({
      getForUser: vi.fn().mockResolvedValue({
        ...validResult,
        internalScore: 40,
      }),
    });

    await expect(
      service.getForUser('00000000-0000-4000-8000-000000000901'),
    ).rejects.toBeInstanceOf(RecommendationPublicResponseError);
  });
});
