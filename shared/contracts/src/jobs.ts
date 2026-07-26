/** HTTP와 queue에서 공유하는 Job payload를 런타임 검증한다 */
import { z } from 'zod';

/** 초기 비동기 작업 종류 */
export const jobTypeSchema = z.enum([
  'VOCAB_IMPORT',
  'VOCABULARY_EXTRACTION',
  'QUESTION_GENERATION',
  'VOCABULARY_THEN_QUESTION_GENERATION',
]);

/** 지원 입력 형식 */
export const inputTypeSchema = z.enum(['TEXT', 'PDF', 'IMAGE']);

/** Job 전체 진행 상태 */
export const jobStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_FAILURES',
  'FAILED',
  'CANCELLED',
]);

/** 중복 요청을 안전하게 합치는 Job 생성 요청 */
export const createJobRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  type: jobTypeSchema,
  uploadIds: z.array(z.string().uuid()).min(1),
});

/** API와 worker가 공유하는 Job 응답 */
export const jobResponseSchema = z.object({
  id: z.string().uuid(),
  status: jobStatusSchema,
  attempt: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

/** 검증된 Job 생성 request type */
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

/** 직렬화 가능한 Job response type */
export type JobResponse = z.infer<typeof jobResponseSchema>;

/** 신규 콘텐츠 제작 계약을 기존 Job package 경계에서 호환 노출한다 */
export * from './content-production/content-production.js';
