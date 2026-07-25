/** blank 기본값을 유지하는 문제 버전 JSON form 입력만 검증한다 */
import { z } from 'zod';

/** RHF가 소유할 canonical JSON 문자열 입력 schema */
export const questionVersionJsonFormSchema = z.object({
  payloadJson: z.string().min(1, 'canonical JSON을 입력해 주세요.'),
});

/** 문제 버전 JSON form 값 */
export type QuestionVersionJsonFormValues = z.infer<
  typeof questionVersionJsonFormSchema
>;
