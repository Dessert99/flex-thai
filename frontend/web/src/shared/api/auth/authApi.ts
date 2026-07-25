/** 인증 세션 조정에 필요한 서버 endpoint adapter를 정의한다 */
import {
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  totpChallengeRequestSchema,
  totpSetupResponseSchema,
  totpSetupVerifyRequestSchema,
  type AuthenticatedResponse,
  type LoginInput,
  type LoginResponse,
  type MeResponse,
  type TotpChallengeInput,
  type TotpSetupResponse,
  type TotpSetupVerifyInput,
} from '@flex-thia/contracts';
import { ApiError } from '../ApiError';
import { apiRequest } from '../apiRequest';

/** 이메일·비밀번호 로그인 응답과 refresh cookie를 검증한다 */
export function requestLogin(input: LoginInput): Promise<LoginResponse> {
  return apiRequest({
    body: loginRequestSchema.parse(input),
    includeCredentials: true,
    method: 'POST',
    path: '/auth/login',
    response: { kind: 'json', schema: loginResponseSchema },
  });
}

/** 메모리 challenge 정보로 로그인 TOTP를 완료한다 */
export function requestLoginTotp(
  input: TotpChallengeInput,
): Promise<LoginResponse> {
  return apiRequest({
    body: totpChallengeRequestSchema.parse(input),
    includeCredentials: true,
    method: 'POST',
    path: '/auth/mfa/totp/challenge',
    response: { kind: 'json', schema: loginResponseSchema },
  });
}

/** refresh cookie를 회전하고 새 access token 응답을 검증한다 */
export async function requestRefresh(): Promise<AuthenticatedResponse> {
  const response = await apiRequest({
    includeCredentials: true,
    method: 'POST',
    path: '/auth/refresh',
    response: { kind: 'json', schema: loginResponseSchema },
  });

  if (response.status !== 'AUTHENTICATED') {
    throw new ApiError({ kind: 'invalid-response' });
  }

  return response;
}

/** access token으로 최신 공개 사용자 상태를 조회한다 */
export function requestMe(accessToken: string): Promise<MeResponse> {
  return apiRequest({
    accessToken,
    path: '/me',
    response: { kind: 'json', schema: meResponseSchema },
  });
}

/** 서버 refresh session이 폐기된 경우에만 logout을 완료한다 */
export function requestLogout(): Promise<void> {
  return apiRequest({
    includeCredentials: true,
    method: 'POST',
    path: '/auth/logout',
    response: { kind: 'empty' },
  });
}

/** 현재 관리자 access token으로 TOTP secret 생성을 시작한다 */
export function requestTotpSetup(
  accessToken: string,
): Promise<TotpSetupResponse> {
  return apiRequest({
    accessToken,
    method: 'POST',
    path: '/auth/mfa/totp/setup',
    response: { kind: 'json', schema: totpSetupResponseSchema },
  });
}

/** TOTP 코드를 검증하고 최신 관리자 공개 상태를 반환한다 */
export function requestTotpSetupVerification(
  accessToken: string,
  input: TotpSetupVerifyInput,
): Promise<MeResponse> {
  return apiRequest({
    accessToken,
    body: totpSetupVerifyRequestSchema.parse(input),
    method: 'POST',
    path: '/auth/mfa/totp/setup/verify',
    response: { kind: 'json', schema: meResponseSchema },
  });
}
