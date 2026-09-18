/** 단어 추출 지시문 템플릿의 관리자 요청·응답 계약 */
import { z } from 'zod';

export const extractionTemplateInputSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine((value) => !/[\r\n]/.test(value), '설명은 한 줄로 입력하세요.'),
    body: z.string().trim().min(1).max(20000),
  })
  .strict();
export const extractionTemplateSchema = extractionTemplateInputSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
});
export const extractionTemplateListSchema = z.object({
  items: z.array(extractionTemplateSchema),
});
export type ExtractionTemplateInput = z.infer<
  typeof extractionTemplateInputSchema
>;
export type ExtractionTemplate = z.infer<typeof extractionTemplateSchema>;
