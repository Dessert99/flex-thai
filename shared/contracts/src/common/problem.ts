/** 공개 API 오류 응답을 RFC 9457 형태로 런타임 검증한다 */
import { z } from 'zod';

/** 클라이언트가 일관되게 처리할 수 있는 공개 오류 응답 */
export const problemDetailsSchema = z
  .object({
    type: z.string().url(),
    title: z.string().min(1),
    status: z.number().int().positive(),
    code: z.string().min(1),
    requestId: z.string().min(1),
    fieldErrors: z.array(
      z.object({ path: z.string(), message: z.string() }).strict(),
    ),
  })
  .strict();

/** 직렬화 가능한 공개 오류 응답 type */
export type ProblemDetailsResponse = z.infer<typeof problemDetailsSchema>;
