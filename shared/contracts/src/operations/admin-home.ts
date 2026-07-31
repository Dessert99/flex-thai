/** 관리자 홈이 소비하는 운영 집계와 MFA 공개 응답을 정의한다 */
import { z } from 'zod';

const countSchema = z.number().int().nonnegative();

/** 관리자 홈의 DB 운영 집계와 MFA 상태 응답 */
export const adminHomeOperationsResponseSchema = z
  .object({
    feedback: z.object({ pendingCount: countSchema }).strict(),
    candidates: z
      .object({
        questionPendingCount: countSchema,
        vocabularyPendingCount: countSchema,
      })
      .strict(),
    contentProduction: z
      .object({
        runningCount: countSchema,
        failedCount: countSchema,
      })
      .strict(),
    tts: z
      .object({
        runningCount: countSchema,
        failedCount: countSchema,
      })
      .strict(),
    mfa: z
      .object({
        enrolled: z.boolean(),
        enrolledAt: z.iso.datetime().nullable(),
        recentVerificationAt: z.iso.datetime().nullable(),
      })
      .strict(),
  })
  .strict();

/** 직렬화 가능한 관리자 홈 운영 집계 */
export type AdminHomeOperationsResponse = z.infer<
  typeof adminHomeOperationsResponseSchema
>;
