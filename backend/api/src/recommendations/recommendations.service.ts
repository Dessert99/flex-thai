/** 추천 read model을 strict 공개 응답으로 변환한다 */
import {
  recommendationResponseSchema,
  type RecommendationResponse,
} from '@flex-thia/contracts';
import type { DrizzleRecommendationQuery } from '@flex-thia/database';

type RecommendationQuery = Pick<DrizzleRecommendationQuery, 'getForUser'>;

/** 내부 projection 누수를 stable 오류로 차단한다 */
export class RecommendationPublicResponseError extends Error {
  constructor() {
    super('RECOMMENDATION_PUBLIC_RESPONSE_INVALID');
    this.name = 'RecommendationPublicResponseError';
  }
}

/** 추천 HTTP facade */
export class RecommendationsService {
  constructor(private readonly query: RecommendationQuery) {}

  /** 인증 사용자의 현재 추천을 공개 계약으로 반환한다 */
  async getForUser(userId: string): Promise<RecommendationResponse> {
    const parsed = recommendationResponseSchema.safeParse(
      await this.query.getForUser(userId),
    );
    if (!parsed.success) throw new RecommendationPublicResponseError();
    return parsed.data;
  }
}
