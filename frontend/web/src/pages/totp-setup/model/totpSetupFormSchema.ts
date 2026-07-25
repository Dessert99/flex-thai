/** TOTP enrollment 확인 form을 공개 code 계약으로 검증한다 */
import {
  totpSetupVerifyRequestSchema,
  type TotpSetupVerifyInput,
} from '@flex-thia/contracts';

/** TOTP 등록 확인에 사용하는 6자리 code schema */
export const totpSetupFormSchema = totpSetupVerifyRequestSchema;

/** TOTP 등록 확인 form 입력 type */
export type TotpSetupFormInput = TotpSetupVerifyInput;
