/** health와 readiness의 공개 상태 응답 계약을 정의한다 */
import { z } from 'zod';

/** API 프로세스 생존 응답 */
export const healthResponseSchema = z
  .object({ status: z.literal('ok'), service: z.literal('api') })
  .strict();

/** DB 연결 준비 완료 응답 */
export const readinessResponseSchema = z
  .object({ status: z.literal('ready') })
  .strict();

/** 직렬화 가능한 API 생존 응답 type */
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** 직렬화 가능한 DB 준비 응답 type */
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
