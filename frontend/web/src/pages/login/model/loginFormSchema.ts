/** 로그인 form 입력을 공개 요청 계약으로 검증한다 */
import { loginRequestSchema } from '@flex-thia/contracts';

/** React Hook Form이 사용하는 로그인 공개 계약 */
export const loginFormSchema = loginRequestSchema;
