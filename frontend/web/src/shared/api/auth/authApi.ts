/** 인증 세션 조정에 필요한 서버 endpoint adapter를 정의한다 */
import {
  loginResponseSchema,
  meResponseSchema,
  type AuthenticatedResponse,
  type MeResponse,
} from '@flex-thia/contracts';
import { ApiError } from '../ApiError';
import { apiRequest } from '../apiRequest';

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
