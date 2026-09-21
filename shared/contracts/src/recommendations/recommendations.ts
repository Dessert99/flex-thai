/** 학습자 홈이 소비하는 개인 추천 공개 응답을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.uuid();

/** 어휘 추천의 가장 높은 기여 신호 */
export const vocabularyRecommendationReasonCodeSchema = z.enum([
  'RECENTLY_PUBLISHED',
  'IN_WORDBOOK',
]);

const vocabularyRecommendationSchema = z
  .object({
    id: uuidSchema,
    thai: z.string().min(1),
    kind: z.enum(['WORD', 'EXPRESSION']),
    reasonCode: vocabularyRecommendationReasonCodeSchema,
    reason: z.string().min(1),
  })
  .strict();

const homeVocabularySchema = z
  .object({
    id: uuidSchema,
    thai: z.string().min(1),
    kind: z.enum(['WORD', 'EXPRESSION']),
    publishedAt: z.iso.datetime(),
  })
  .strict();

const homeContentSchema = z
  .object({
    vocabularies: z.array(homeVocabularySchema).max(3),
  })
  .strict();

/** 개인화 활성화 상태와 문제·어휘 추천을 한 요청으로 반환한다 */
export const recommendationResponseSchema = z
  .object({
    mode: z.enum(['PERSONALIZED', 'FALLBACK']),
    meaningfulSignalCount: z.number().int().nonnegative(),
    activationThreshold: z.number().int().positive(),
    publishedToday: homeContentSchema,
    newContent: homeContentSchema,
    vocabularies: z.array(vocabularyRecommendationSchema).max(3),
  })
  .strict();

/** 어휘 추천 이유 code */
export type VocabularyRecommendationReasonCode = z.infer<
  typeof vocabularyRecommendationReasonCodeSchema
>;

/** 직렬화 가능한 개인 추천 응답 */
export type RecommendationResponse = z.infer<
  typeof recommendationResponseSchema
>;
