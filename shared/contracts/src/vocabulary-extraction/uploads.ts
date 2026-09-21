/** 단어 추출 upload·preset·prompt·작업 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.string().uuid();

/** 단어 추출이 지원하는 입력 형식 */
export const extractionInputTypeSchema = z.enum(['TEXT', 'PDF', 'IMAGE']);

/** private 입력 object 정책 생성 요청 */
export const uploadPolicyRequestSchema = z
  .object({
    inputType: extractionInputTypeSchema,
    contentType: z.string().min(1),
    declaredSizeBytes: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
  })
  .strict()
  .superRefine((value, context) => {
    const allowedContentTypes = {
      TEXT: ['text/plain'],
      PDF: ['application/pdf'],
      IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
    }[value.inputType];
    if (!allowedContentTypes.includes(value.contentType)) {
      context.addIssue({
        code: 'custom',
        path: ['contentType'],
        message: '입력 형식에 허용되지 않은 MIME입니다.',
      });
    }
  });

/** private 입력 object 정책 응답 */
export const uploadPolicyResponseSchema = z
  .object({
    uploadId: uuidSchema,
    url: z.string().url(),
    fields: z.record(z.string(), z.string()),
    expiresAt: z.string().datetime(),
  })
  .strict();

/** 완료 검증된 입력 object 응답 */
export const completedUploadResponseSchema = z
  .object({
    uploadId: uuidSchema,
    inputType: extractionInputTypeSchema,
    sizeBytes: z.number().int().positive(),
    status: z.literal('VERIFIED'),
  })
  .strict();

/** 단어 추출 upload path */
export const extractionUploadPathSchema = z
  .object({ uploadId: uuidSchema })
  .strict();
