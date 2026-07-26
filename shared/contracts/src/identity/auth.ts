/** 로그인·TOTP·현재 사용자 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(1).max(256);
const totpCodeSchema = z.string().regex(/^\d{6}$/u);

/** 이메일 challenge 시작 요청 계약 */
export const startEmailAuthenticationRequestSchema = z
  .object({
    email: z
      .string()
      .refine((email) => z.email().safeParse(email.trim()).success),
  })
  .strict();

/** 계정 존재 여부를 드러내지 않는 challenge 응답 계약 */
export const emailAuthenticationChallengeResponseSchema = z
  .object({
    challengeId: z.uuid(),
    expiresAt: z.iso.datetime(),
    resendAt: z.iso.datetime(),
  })
  .strict();

/** 이메일 코드 확인 요청 계약 */
export const verifyEmailCodeRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/u),
  })
  .strict();

/** 이메일 링크 확인 요청 계약 */
export const confirmEmailLinkRequestSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  })
  .strict();

/** 이메일과 비밀번호 로그인 요청 */
export const loginRequestSchema = z
  .object({ email: emailSchema, password: passwordSchema })
  .strict();

/** Cognito SOFTWARE_TOKEN_MFA challenge 완료 요청 */
export const totpChallengeRequestSchema = z
  .object({
    email: emailSchema,
    challengeToken: z.string().min(1).max(4096),
    code: totpCodeSchema,
  })
  .strict();

/** TOTP 등록 검증 요청 */
export const totpSetupVerifyRequestSchema = z
  .object({ code: totpCodeSchema })
  .strict();

/** 인증 앱에 등록할 Cognito TOTP secret 응답 */
export const totpSetupResponseSchema = z
  .object({ secretCode: z.string().min(16).max(128) })
  .strict();

const userSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  role: z.enum(['LEARNER', 'ADMIN']),
  mfaEnrolled: z.boolean(),
});

/** access token과 공개 사용자 정보를 반환하는 인증 성공 응답 */
export const authenticatedResponseSchema = z.object({
  status: z.literal('AUTHENTICATED'),
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: userSchema,
});

/** 비밀번호 인증이 TOTP 입력을 요구하는 응답 */
export const mfaRequiredResponseSchema = z.object({
  status: z.literal('MFA_REQUIRED'),
  challengeToken: z.string().min(1),
});

/** 로그인·TOTP 완료·refresh가 공유하는 인증 응답 */
export const loginResponseSchema = z.discriminatedUnion('status', [
  authenticatedResponseSchema,
  mfaRequiredResponseSchema,
]);

/** 현재 인증 사용자 응답 */
export const meResponseSchema = userSchema;

/** 검증된 로그인 요청 type */
export type LoginInput = z.infer<typeof loginRequestSchema>;

/** 이메일 challenge 시작 요청 */
export type StartEmailAuthenticationInput = z.infer<
  typeof startEmailAuthenticationRequestSchema
>;

/** 계정 존재 여부를 드러내지 않는 challenge 응답 */
export type EmailAuthenticationChallengeResponse = z.infer<
  typeof emailAuthenticationChallengeResponseSchema
>;

/** 이메일 코드 확인 요청 */
export type VerifyEmailCodeInput = z.infer<
  typeof verifyEmailCodeRequestSchema
>;

/** 이메일 링크 확인 요청 */
export type ConfirmEmailLinkInput = z.infer<
  typeof confirmEmailLinkRequestSchema
>;

/** 검증된 TOTP challenge 요청 type */
export type TotpChallengeInput = z.infer<typeof totpChallengeRequestSchema>;

/** 검증된 TOTP 등록 요청 type */
export type TotpSetupVerifyInput = z.infer<typeof totpSetupVerifyRequestSchema>;

/** 직렬화 가능한 TOTP 등록 응답 type */
export type TotpSetupResponse = z.infer<typeof totpSetupResponseSchema>;

/** 직렬화 가능한 인증 성공 응답 type */
export type AuthenticatedResponse = z.infer<typeof authenticatedResponseSchema>;

/** 직렬화 가능한 로그인 응답 type */
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** 직렬화 가능한 현재 사용자 응답 type */
export type MeResponse = z.infer<typeof meResponseSchema>;
