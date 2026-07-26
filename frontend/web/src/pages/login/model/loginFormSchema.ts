/** 로그인 form 입력을 학교 이메일 공개 요청 계약으로 검증한다 */
import { startEmailAuthenticationRequestSchema } from '@flex-thia/contracts';

/** React Hook Form에서 hufs.ac.kr 이메일만 제출하게 한다 */
export const loginFormSchema = startEmailAuthenticationRequestSchema.refine(
  ({ email }) => email.trim().toLowerCase().endsWith('@hufs.ac.kr'),
  { path: ['email'], message: '학교 이메일을 입력해 주세요.' },
);
