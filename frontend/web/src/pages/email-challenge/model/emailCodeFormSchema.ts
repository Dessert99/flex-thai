/** 이메일 challenge code form을 공개 6자리 계약으로 검증한다 */
import { verifyEmailCodeRequestSchema } from '@flex-thia/contracts';

/** React Hook Form이 사용하는 이메일 code 계약 */
export const emailCodeFormSchema = verifyEmailCodeRequestSchema;
