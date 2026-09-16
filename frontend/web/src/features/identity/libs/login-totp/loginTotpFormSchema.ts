/** 로그인 TOTP form을 공개 6자리 code 계약으로 검증한다 */
import { z } from 'zod';

/** 로그인 challenge에 입력할 6자리 숫자 schema */
export const loginTotpFormSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/u, '6자리 숫자를 입력해 주세요.'),
  })
  .strict();

/** 로그인 TOTP form 입력 type */
export type LoginTotpFormInput = z.infer<typeof loginTotpFormSchema>;
