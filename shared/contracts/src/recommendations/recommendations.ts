/** 학습자 홈이 소비하는 개인 추천 공개 응답을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.uuid();

/** 문제 추천의 가장 높은 기여 신호 */
export const questionRecommendationReasonCodeSchema = z.enum([
  'RECENTLY_PUBLISHED',
  'SAVED_QUESTION',
  'FIRST_INCORRECT_RETRY',
  'PRACTICE_MISSED_VOCABULARY',
  'SIMILAR_QUESTION_TYPE',
  'SAVED_QUESTION_VOCABULARY',
]);

/** 어휘 추천의 가장 높은 기여 신호 */
export const vocabularyRecommendationReasonCodeSchema = z.enum([
  'RECENTLY_PUBLISHED',
  'IN_WORDBOOK',
  'PRACTICE_INCORRECT',
  'FIRST_INCORRECT_QUESTION_VOCABULARY',
  'SAVED_QUESTION_VOCABULARY',
]);

const questionRecommendationSchema = z
  .object({
    questionId: uuidSchema,
    questionVersionId: uuidSchema,
    questionType: z
      .object({
        id: uuidSchema,
        slug: z.string().min(1),
        displayName: z.string().min(1),
      })
      .strict(),
    skill: z.enum(['READING', 'LISTENING']),
    difficulty: z.number().int().min(1).max(5),
    reasonCode: questionRecommendationReasonCodeSchema,
    reason: z.string().min(1),
  })
  .strict();

const vocabularyRecommendationSchema = z
  .object({
    id: uuidSchema,
    thai: z.string().min(1),
    kind: z.enum(['WORD', 'EXPRESSION']),
    reasonCode: vocabularyRecommendationReasonCodeSchema,
    reason: z.string().min(1),
  })
  .strict();

/** 개인화 활성화 상태와 문제·어휘 추천을 한 요청으로 반환한다 */
export const recommendationResponseSchema = z
  .object({
    mode: z.enum(['PERSONALIZED', 'FALLBACK']),
    meaningfulSignalCount: z.number().int().nonnegative(),
    activationThreshold: z.number().int().positive(),
    questions: z.array(questionRecommendationSchema).max(3),
    vocabularies: z.array(vocabularyRecommendationSchema).max(3),
  })
  .strict();

/** 문제 추천 이유 code */
export type QuestionRecommendationReasonCode = z.infer<
  typeof questionRecommendationReasonCodeSchema
>;

/** 어휘 추천 이유 code */
export type VocabularyRecommendationReasonCode = z.infer<
  typeof vocabularyRecommendationReasonCodeSchema
>;

/** 직렬화 가능한 개인 추천 응답 */
export type RecommendationResponse = z.infer<
  typeof recommendationResponseSchema
>;
